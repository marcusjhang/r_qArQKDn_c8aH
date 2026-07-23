'use client';

// Mention notification inbox in the top bar: a bell with an unread badge and a
// dropdown of the mentions targeting the current account. Opening a
// notification jumps to that applicant's chat and marks it read; each row can
// be cleared with its ✕, and the header offers "Mark all read" and "Clear all".
// Initial data is server-rendered; reads/clears go through the chat-actions and
// the page revalidates.

import { useRouter } from 'next/navigation';
import { Bell, X } from 'lucide-react';
import {
  dismissAllNotifications,
  dismissNotification,
  markAllNotificationsRead,
  markNotificationRead
} from '@/lib/hiring/chat/actions';
import { formatMessageTime } from '@/lib/hiring/helpers';
import type { Notification } from '@/lib/hiring/model/types';
import { useDismissableMenu } from './hooks/useDismissableMenu';

export default function NotificationBell({
  notifications,
  onOpen
}: {
  notifications: Notification[];
  onOpen: (candidateId: number, jobId: number, messageId: number) => void;
}) {
  const menu = useDismissableMenu();
  const router = useRouter();

  const unread = notifications.filter((n) => !n.read).length;

  function openNotification(n: Notification) {
    menu.close();
    onOpen(n.candidateId, n.jobId, n.messageId);
    if (!n.read) {
      markNotificationRead(n.id)
        .then(() => router.refresh())
        .catch(() => {});
    }
  }

  function markAllRead() {
    markAllNotificationsRead()
      .then(() => router.refresh())
      .catch(() => {});
  }

  function dismissOne(n: Notification) {
    dismissNotification(n.id)
      .then(() => router.refresh())
      .catch(() => {});
  }

  function clearAll() {
    dismissAllNotifications()
      .then(() => router.refresh())
      .catch(() => {});
  }

  return (
    <div className="notif" ref={menu.wrapRef}>
      <button
        className="btn notif-btn"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
        {...menu.triggerProps}
      >
        <Bell size={16} aria-hidden />
        {unread > 0 && <span className="notif-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {menu.open && (
        <div className="notif-menu" {...menu.menuProps}>
          <div className="notif-head">
            <span>Notifications</span>
            {notifications.length > 0 && (
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
          {notifications.length === 0 ? (
            <div className="notif-empty">You&apos;re all caught up.</div>
          ) : (
            <div className="notif-list">
              {notifications.map((n) => (
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
