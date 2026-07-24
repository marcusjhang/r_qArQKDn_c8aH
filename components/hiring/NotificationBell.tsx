'use client';

// Notification inbox in the top bar: a bell with an unread badge and a dropdown
// carrying two streams. Mentions targeting the current account are
// server-rendered (seeded via `initialData`) and refreshed by query
// invalidation after a read/clear; opening one jumps to that applicant's chat
// and marks it read, and each row can be cleared with its ✕. Stalled-candidate
// alerts are derived on the client for candidates the signed-in user owns that
// have sat in a stage past the warn threshold; opening one jumps to the
// candidate. They
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

// Row shell shared by every notification (mention + stalled-candidate alert).
// `group/notif` drives the reveal of the per-row dismiss button on hover.
const NOTIF_ITEM =
  'group/notif relative flex items-stretch rounded-[6px] text-foreground';
// The button that fills the row and opens the mention/candidate.
const NOTIF_OPEN =
  'flex min-w-0 flex-1 flex-col gap-[3px] rounded-[6px] px-2.5 py-2 text-left text-inherit';

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
    <div className="relative" ref={menu.wrapRef}>
      <Button
        variant="app"
        className="relative px-[10px] text-[15px] leading-none"
        aria-label={`Notifications${badgeCount ? ` (${badgeCount} new)` : ''}`}
        {...menu.triggerProps}
      >
        <Bell size={16} aria-hidden />
        {badgeCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-sno px-1 text-[10px] font-bold text-white">
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </Button>

      {menu.open && (
        <div
          className="absolute right-0 top-full z-[26] mt-1.5 flex max-h-[420px] w-[320px] max-w-[86vw] flex-col overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-ds"
          {...menu.menuProps}
        >
          <div className="flex items-center justify-between px-2.5 pb-1.5 pt-2 text-[12px] font-bold uppercase tracking-[0.03em] text-muted-foreground">
            <span>Notifications</span>
            {items.length > 0 && (
              <span className="flex items-center gap-0.5">
                {unread > 0 && (
                  <button
                    className="rounded-[4px] px-1 py-0.5 text-[11px] font-semibold normal-case tracking-normal text-primary hover:bg-primary-weak"
                    onClick={markAllRead}
                  >
                    Mark all read
                  </button>
                )}
                <button
                  className="rounded-[4px] px-1 py-0.5 text-[11px] font-semibold normal-case tracking-normal text-primary hover:bg-primary-weak"
                  onClick={clearAll}
                >
                  Clear all
                </button>
              </span>
            )}
          </div>
          {items.length === 0 && stageAlerts.length === 0 ? (
            <div className="px-2.5 py-3 text-[12.5px] text-muted-foreground">
              You&apos;re all caught up.
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {stageAlerts.map((a) => (
                <div
                  key={`alert-${a.candidateId}`}
                  data-testid="notif-item"
                  data-kind="alert"
                  className={`${NOTIF_ITEM} border-l-[3px] border-sno bg-sno-bg hover:brightness-[0.98]`}
                >
                  <button className={NOTIF_OPEN} onClick={() => openAlert(a)}>
                    <div className="flex items-baseline gap-2">
                      <span className="text-[12.5px] font-semibold text-sno">
                        Stalled candidate
                      </span>
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        {a.days}d in stage
                      </span>
                    </div>
                    <div className="text-[12px] text-muted-foreground">
                      <b>{a.candidateName}</b> has been in {a.stage} for {a.days}{' '}
                      day{a.days === 1 ? '' : 's'}
                    </div>
                  </button>
                </div>
              ))}
              {items.map((n) => (
                <div
                  key={n.id}
                  data-testid="notif-item"
                  data-kind="mention"
                  className={`${NOTIF_ITEM} ${
                    n.read
                      ? 'hover:bg-surface-2'
                      : 'bg-primary-weak hover:brightness-[0.98]'
                  }`}
                >
                  <button
                    className={NOTIF_OPEN}
                    onClick={() => openNotification(n)}
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="text-[12.5px] font-semibold">
                        {n.authorName}
                      </span>
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        {formatMessageTime(n.createdAt)}
                      </span>
                    </div>
                    <div className="text-[12px] text-muted-foreground">
                      tagged you on <b>{n.candidateName}</b>
                    </div>
                    <div className="line-clamp-2 text-[12px] text-foreground">
                      {n.body}
                    </div>
                  </button>
                  <button
                    className="mr-1.5 mt-1.5 flex-none self-start rounded-[4px] p-[3px] leading-[0] text-muted-foreground opacity-0 hover:bg-surface hover:text-foreground focus-visible:opacity-100 group-hover/notif:opacity-100"
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
