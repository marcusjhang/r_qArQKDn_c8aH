'use client';

// Mention notification inbox in the top bar: a bell with an unread badge and a
// dropdown of the mentions targeting the current account. Opening a
// notification jumps to that applicant's chat and marks it read; there's also a
// "mark all read". Initial data is server-rendered; reads/clears go through the
// chat-actions and the page revalidates.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  markAllNotificationsRead,
  markNotificationRead
} from '@/lib/hiring/chat-actions';
import { formatMessageTime } from '@/lib/hiring/helpers';
import type { Notification } from '@/lib/hiring/types';

export default function NotificationBell({
  notifications,
  onOpen
}: {
  notifications: Notification[];
  onOpen: (candidateId: number, jobId: number, messageId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);

  const unread = notifications.filter((n) => !n.read).length;

  // Close the dropdown on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function openNotification(n: Notification) {
    setOpen(false);
    onOpen(n.candidateId, n.jobId, n.messageId);
    if (!n.read) {
      markNotificationRead(n.id)
        .then(() => router.refresh())
        .catch(() => {});
    }
  }

  function clearAll() {
    markAllNotificationsRead()
      .then(() => router.refresh())
      .catch(() => {});
  }

  return (
    <div className="notif" ref={wrapRef}>
      <button
        className="btn notif-btn"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden>🔔</span>
        {unread > 0 && <span className="notif-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div className="notif-menu" role="menu">
          <div className="notif-head">
            <span>Notifications</span>
            {unread > 0 && (
              <button className="notif-clear" onClick={clearAll}>
                Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <div className="notif-empty">
              You&apos;re all caught up. When someone tags you, it&apos;ll show
              up here.
            </div>
          ) : (
            <div className="notif-list">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  className={`notif-item${n.read ? '' : ' unread'}`}
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
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
