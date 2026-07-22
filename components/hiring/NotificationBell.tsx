'use client';

// In-app notification feed for candidate owners. Opening the bell sweeps
// current warning states server-side, so it reflects the latest attention
// items plus any 'scheduled' events. (Team-shared feed: each item is labelled
// with the owner it's for, since logins aren't yet mapped to founder ids.)

import { useEffect, useRef, useState } from 'react';
import { founderById } from '@/lib/hiring/helpers';
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead
} from '@/lib/hiring/notifications/actions';
import type { SelectNotification } from '@/lib/schema';

function icon(kind: SelectNotification['kind']): string {
  return kind === 'scheduled' ? '📅' : '⚠';
}

function timeAgo(d: Date): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SelectNotification[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const load = () => listNotifications().then(setItems);

  // Load on mount and whenever the panel is opened (re-runs the warning sweep).
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (open) load();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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

  const unread = items.filter((n) => !n.readAt).length;

  async function readOne(id: number) {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: new Date() } : n))
    );
    await markNotificationRead(id);
  }
  async function readAll() {
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date() })));
    await markAllNotificationsRead();
  }

  return (
    <div className="notif" ref={ref}>
      <button
        className="notif-bell"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        🔔
        {unread > 0 && <span className="notif-badge">{unread}</span>}
      </button>
      {open && (
        <div className="notif-menu" role="menu">
          <div className="notif-head">
            <span>Notifications</span>
            {unread > 0 && (
              <button className="linkbtn" onClick={readAll}>
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <div className="notif-empty">You’re all caught up.</div>
          ) : (
            <ul className="notif-list">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={`notif-item${n.readAt ? '' : ' unread'}`}
                  onClick={() => !n.readAt && readOne(n.id)}
                >
                  <span className="notif-ico" aria-hidden="true">
                    {icon(n.kind)}
                  </span>
                  <div className="notif-body">
                    <div className="notif-msg">{n.message}</div>
                    <div className="notif-meta">
                      for {founderById(n.recipientFounderId).name} ·{' '}
                      {timeAgo(n.createdAt)}
                    </div>
                  </div>
                  {!n.readAt && <span className="notif-dot" />}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
