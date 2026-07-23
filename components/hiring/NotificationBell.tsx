'use client';

// Mention notification inbox in the top bar: a bell with an unread badge and a
// dropdown of the mentions targeting the current account. Opening a
// notification jumps to that applicant's chat and marks it read; each row can
// be cleared with its ✕, and the header offers "Mark all read" and "Clear all".
// Initial data is server-rendered (seeded via `initialData`); each read/clear is
// a `useMutation` that, on success, invalidates the notifications query so it
// re-reads the authoritative inbox — replacing the old per-handler
// router.refresh().

import { Bell, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  dismissAllNotifications,
  dismissNotification,
  markAllNotificationsRead,
  markNotificationRead
} from '@/lib/hiring/chat-actions';
import { fetchNotifications } from '@/lib/hiring/board-query';
import { hiringKeys } from '@/lib/hiring/query-keys';
import { formatMessageTime } from '@/lib/hiring/helpers';
import type { Notification } from '@/lib/hiring/types';
import { Button } from '@/components/ui/button';
import { useDismissableMenu } from './hooks/useDismissableMenu';

export default function NotificationBell({
  notifications,
  onOpen
}: {
  notifications: Notification[];
  onOpen: (candidateId: number, jobId: number, messageId: number) => void;
}) {
  const menu = useDismissableMenu();
  const queryClient = useQueryClient();

  // Server-rendered inbox as the seed; refreshed by invalidation after a
  // read/clear rather than by refreshing the whole route.
  const { data: items = notifications } = useQuery({
    queryKey: hiringKeys.notifications,
    queryFn: fetchNotifications,
    initialData: notifications
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: hiringKeys.notifications });

  const markRead = useMutation({
    mutationFn: (mentionId: number) => markNotificationRead(mentionId),
    onSuccess: invalidate
  });
  const markAll = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: invalidate
  });
  const dismiss = useMutation({
    mutationFn: (mentionId: number) => dismissNotification(mentionId),
    onSuccess: invalidate
  });
  const clear = useMutation({
    mutationFn: () => dismissAllNotifications(),
    onSuccess: invalidate
  });

  const unread = items.filter((n) => !n.read).length;

  function openNotification(n: Notification) {
    menu.close();
    onOpen(n.candidateId, n.jobId, n.messageId);
    if (!n.read) markRead.mutate(n.id);
  }

  function markAllRead() {
    markAll.mutate();
  }

  function dismissOne(n: Notification) {
    dismiss.mutate(n.id);
  }

  function clearAll() {
    clear.mutate();
  }

  return (
    <div className="notif" ref={menu.wrapRef}>
      <Button
        variant="app"
        className="notif-btn"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
        {...menu.triggerProps}
      >
        <Bell size={16} aria-hidden />
        {unread > 0 && <span className="notif-badge">{unread > 99 ? '99+' : unread}</span>}
      </Button>

      {menu.open && (
        <div className="notif-menu" {...menu.menuProps}>
          <div className="notif-head">
            <span>Notifications</span>
            {items.length > 0 && (
              <span className="notif-actions">
                {unread > 0 && (
                  <button className="notif-clear" onClick={markAllRead}>
                    Mark all read
                  </button>
                )}
                <button className="notif-clear" onClick={clearAll}>
                  Clear all
                </button>
              </span>
            )}
          </div>
          {items.length === 0 ? (
            <div className="notif-empty">You&apos;re all caught up.</div>
          ) : (
            <div className="notif-list">
              {items.map((n) => (
                <div
                  key={n.id}
                  className={`notif-item${n.read ? '' : ' unread'}`}
                >
                  <button
                    className="notif-open"
                    onClick={() => openNotification(n)}
                  >
                    <div className="notif-item-top">
                      <span className="notif-who">{n.authorName}</span>
                      <span className="notif-time">
                        {formatMessageTime(n.createdAt)}
                      </span>
                    </div>
                    <div className="notif-ctx">
                      tagged you on <b>{n.candidateName}</b>
                    </div>
                    <div className="notif-body">{n.body}</div>
                  </button>
                  <button
                    className="notif-dismiss"
                    aria-label="Clear notification"
                    onClick={() => dismissOne(n)}
                  >
                    <X size={13} aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
