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

import { displayName, formatMessageTime, initials } from '@/lib/hiring/helpers';
import type { User } from '@/lib/hiring/types';
import { Button } from '@/components/ui/button';
import { useChatThread } from './hooks/useChatThread';

/** Escape a string for safe embedding in a RegExp. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Render a body, highlighting the `@name` tokens for accounts that were tagged. */
function renderBody(body: string, mentionNames: string[]) {
  if (!mentionNames.length) return body;
  // Longest-first alternation so "@Ben Ong" wins over "@Ben"; the trailing
  // boundary stops "@Ben" lighting up inside "@Bennett" or adjacent text.
  const re = new RegExp(
    '@(' +
      mentionNames.map(escapeRe).sort((a, b) => b.length - a.length).join('|') +
      ')(?![\\p{L}\\d])',
    'gu'
  );
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) out.push(body.slice(last, m.index));
    out.push(
      <span className="mention" key={key++}>
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
    <div className="chat">
      <div className="section-title">Discussion</div>

      <div className="chat-msgs" ref={listRef}>
        {loading ? (
          <div className="chat-empty">Loading discussion…</div>
        ) : messages.length === 0 ? (
          <div className="chat-empty">
            No messages yet. Type <b>@</b> to tag a teammate.
          </div>
        ) : (
          messages.map((m) => {
            const mine = currentUser != null && m.authorId === currentUser.id;
            return (
              <div
                className={`chat-msg${mine ? ' mine' : ''}`}
                key={m.id}
                data-mid={m.id}
              >
                <span className="avatar" title={m.authorName}>
                  {m.authorInitials}
                </span>
                <div className="chat-bubble">
                  <div className="chat-meta">
                    <span className="chat-author">{m.authorName}</span>
                    <span className="chat-time">
                      {formatMessageTime(m.createdAt)}
                    </span>
                  </div>
                  <div className="chat-body">
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

      <div className="chat-compose">
        {currentUser == null ? (
          <div className="chat-empty">Sign in to join the discussion.</div>
        ) : (
          <>
            <div className="chat-input-wrap">
              <textarea
                ref={taRef}
                aria-label="Message"
                value={body}
                onChange={onChange}
                onKeyDown={onKeyDown}
                maxLength={4000}
                placeholder="Write a message… use @ to tag a teammate"
              />
              {menu && suggestions.length > 0 && (
                <div className="mention-menu">
                  {suggestions.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className="mention-item"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pick(u);
                      }}
                    >
                      <span className="avatar">{initials(u)}</span>
                      <span className="mention-name">{displayName(u)}</span>
                      <span className="mention-email">{u.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="chat-compose-foot">
              <span className="chat-hint">⌘/Ctrl + Enter to send</span>
              <Button
                variant="appPrimary"
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
