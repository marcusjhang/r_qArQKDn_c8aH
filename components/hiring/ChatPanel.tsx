'use client';

// Per-applicant discussion thread, shown inside the candidate DetailDrawer.
// Messages persist against the candidate (so the chat "follows the applicant"),
// load when a candidate opens, and are appended optimistically on send. The
// composer supports @-mention autocomplete over the board's users (the same
// canonical account list used for owners/interviewers); picking someone tags
// them, which fans out a notification server-side.
//
// The thread's state + behaviour (load/optimistic-send/mention autocomplete)
// lives in useChatThread; this component renders it.

import { Avatar } from '@/components/ui/avatar';
import {
  displayName,
  formatMessageTime,
  initials,
  mentionHighlightPattern
} from '@/lib/hiring/helpers';
import type { User } from '@/lib/hiring/types';
import { Button } from '@/components/ui/button';
import { useChatThread } from './hooks/useChatThread';

/** Render a body, highlighting the `@name` tokens for accounts that were tagged. */
function renderBody(body: string, mentionNames: string[]) {
  // The token-matching rule (longest-name-first, boundary-aware) is a pure
  // domain concern owned by helpers; this component only walks the matches to
  // build the highlighted nodes.
  const re = mentionHighlightPattern(mentionNames);
  if (!re) return body;
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) out.push(body.slice(last, m.index));
    out.push(
      <span
        className="rounded-[4px] bg-primary-weak px-[3px] font-semibold text-primary"
        key={key++}
      >
        {m[0]}
      </span>
    );
    last = m.index + m[0].length;
  }
  if (last < body.length) out.push(body.slice(last));
  return out;
}

export default function ChatPanel({
  candidateId,
  currentUserId,
  users,
  focusMessageId
}: {
  candidateId: number | null;
  // The signed-in user's id (the message author), or null when unresolved.
  currentUserId: number | null;
  // The board's canonical user list — the @-mention pool (HiringState.users).
  users: User[];
  // When opened from a notification, the message to scroll to and highlight.
  focusMessageId?: number | null;
}) {
  const currentUser =
    currentUserId == null
      ? null
      : (users.find((u) => u.id === currentUserId) ?? null);

  const {
    messages,
    loading,
    body,
    menu,
    suggestions,
    sending,
    taRef,
    listRef,
    onChange,
    onKeyDown,
    pick,
    send
  } = useChatThread({
    candidateId,
    currentUser,
    currentUserId,
    users,
    focusMessageId
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.03em] text-muted-foreground">
        Discussion
      </div>

      <div
        className="flex max-h-[320px] flex-col gap-3 overflow-y-auto pr-0.5"
        ref={listRef}
      >
        {loading ? (
          <div className="text-[12.5px] italic text-muted-foreground">
            Loading discussion…
          </div>
        ) : messages.length === 0 ? (
          <div className="text-[12.5px] italic text-muted-foreground">
            No messages yet.
          </div>
        ) : (
          messages.map((m) => {
            const mine = currentUser != null && m.authorId === currentUser.id;
            return (
              <div
                className="flex items-start gap-2"
                key={m.id}
                data-mid={m.id}
              >
                <Avatar title={m.authorName}>{m.authorInitials}</Avatar>
                <div
                  className={`flex min-w-0 flex-1 flex-col gap-1 rounded-md border px-2.5 py-2 ${mine ? 'border-primary-border bg-primary-weak' : 'border-border bg-surface'}`}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-[12.5px] font-semibold">
                      {m.authorName}
                    </span>
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {formatMessageTime(m.createdAt)}
                    </span>
                  </div>
                  <div className="whitespace-pre-wrap break-words text-[12.5px] text-foreground">
                    {renderBody(
                      m.body,
                      m.mentions.map((x) => x.name)
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex flex-col gap-2">
        {currentUser == null ? (
          <div className="text-[12.5px] italic text-muted-foreground">
            Sign in to join the discussion.
          </div>
        ) : (
          <>
            <div className="relative">
              <textarea
                ref={taRef}
                aria-label="Message"
                className="min-h-[60px] w-full resize-y rounded-md border border-border-strong bg-surface px-2.5 py-2 text-[13px] text-foreground focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary-weak focus:ring-offset-0"
                value={body}
                onChange={onChange}
                onKeyDown={onKeyDown}
                maxLength={4000}
                placeholder="Write a message… use @ to tag a teammate"
              />
              {menu && suggestions.length > 0 && (
                <div className="absolute bottom-[calc(100%_+_4px)] left-0 right-0 z-[22] flex max-h-[220px] flex-col overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-ds">
                  {suggestions.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className="flex items-center gap-2 rounded-sm border-0 bg-transparent px-2 py-1.5 text-left text-[12.5px] text-foreground hover:bg-surface-2"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pick(u);
                      }}
                    >
                      <Avatar>{initials(u)}</Avatar>
                      <span className="font-semibold">{displayName(u)}</span>
                      <span className="ml-auto max-w-[45%] truncate text-[11px] text-muted-foreground">
                        {u.email}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-muted-foreground">
                ⌘/Ctrl + Enter to send
              </span>
              <Button
                variant="appPrimary"
                className="ml-auto"
                onClick={send}
                disabled={sending || !body.trim()}
              >
                Send
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
