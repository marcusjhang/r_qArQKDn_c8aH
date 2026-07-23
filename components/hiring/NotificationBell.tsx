'use client';

// Notification inbox in the top bar: a bell with an unread badge and a dropdown
// carrying two streams. Mentions targeting the current account are
// server-rendered (seeded via `initialData`) and refreshed by query
// invalidation after a read/clear; opening one jumps to that applicant's chat
// and marks it read, and each row can be cleared with its ✕. Stalled-candidate
// alerts are derived on the client for candidates the signed-in user owns that
// have overstayed their stage limit; opening one jumps to the candidate. They
// have no read/clear state — they clear when the candidate advances.

import { Bell, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  dismissAllNotifications,
  dismissNotification,
  markAllNotificationsRead,
  markNotificationRead
} from '@/lib/hiring/chat/actions';
import { fetchNotifications } from '@/lib/hiring/board-query';
import { hiringKeys } from '@/lib/hiring/query-keys';
import { formatMessageTime, type StageAlert } from '@/lib/hiring/helpers';
import type { Notification } from '@/lib/hiring/types';
import { Button } from '@/components/ui/button';
import { useDismissableMenu } from './hooks/useDismissableMenu';

export default function NotificationBell({
  notifications,
  stageAlerts,
  onOpen,
  onOpenAlert
}: {
  notifications: Notification[];
  /** Client-derived "your candidate is stalling" alerts for the signed-in owner. */
  stageAlerts: StageAlert[];
  onOpen: (candidateId: number, jobId: number, messageId: number) => void;
  onOpenAlert: (candidateId: number, jobId: number) => void;
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

  // Mentions carry a persisted read state; stage alerts are derived and clear
  // when the candidate advances, so they always count toward the badge.
  const unread = items.filter((n) => !n.read).length;
  const badgeCount = unread + stageAlerts.length;

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

  function openAlert(a: StageAlert) {
    menu.close();
    onOpenAlert(a.candidateId, a.jobId);
  }

  return (
    <div className="notif" ref={menu.wrapRef}>
      <Button
        variant="app"
        className="notif-btn"
        aria-label={`Notifications${badgeCount ? ` (${badgeCount} new)` : ''}`}
        {...menu.triggerProps}
      >
        <Bell size={16} aria-hidden />
        {badgeCount > 0 && (
          <span className="notif-badge">
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
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
          {items.length === 0 && stageAlerts.length === 0 ? (
            <div className="notif-empty">You&apos;re all caught up.</div>
          ) : (
            <div className="notif-list">
              {stageAlerts.map((a) => (
                <div
                  key={`alert-${a.candidateId}`}
                  className="notif-item alert unread"
                >
                  <button className="notif-open" onClick={() => openAlert(a)}>
                    <div className="notif-item-top">
                      <span className="notif-who">Stalled candidate</span>
                      <span className="notif-time">{a.days}d in stage</span>
                    </div>
                    <div className="notif-ctx">
                      <b>{a.candidateName}</b> has been in {a.stage} for {a.days}{' '}
                      day{a.days === 1 ? '' : 's'}, past the {a.limit}-day limit
                    </div>
                  </button>
                </div>
              ))}
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
