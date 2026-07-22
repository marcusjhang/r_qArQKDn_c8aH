'use client';

// Per-applicant discussion thread, shown inside the candidate DetailDrawer.
// Messages persist against the candidate (so the chat "follows the applicant"),
// load when a candidate opens, and are appended optimistically on send. The
// composer supports @-mention autocomplete over the board's users (the same
// canonical account list used for owners/interviewers); picking someone tags
// them, which fans out a notification server-side.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { loadThread, postMessage } from '@/lib/hiring/chat-actions';
import {
  displayName,
  formatMessageTime,
  initials,
  mentionPresent
} from '@/lib/hiring/helpers';
import type { ChatMessage, User } from '@/lib/hiring/types';

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

/** Find the active `@query` token immediately before the caret, if any. */
function activeMention(
  text: string,
  caret: number
): { query: string; start: number } | null {
  const upto = text.slice(0, caret);
  const m = upto.match(/(?:^|\s)@([\p{L}\d._-]*)$/u);
  if (!m) return null;
  const query = m[1];
  return { query, start: caret - query.length - 1 };
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [body, setBody] = useState('');
  // Accounts the author has picked from the @-autocomplete for this draft.
  const [tagged, setTagged] = useState<Set<number>>(new Set());
  const [menu, setMenu] = useState<{ start: number; query: string } | null>(null);
  const [sending, setSending] = useState(false);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const tempId = useRef(-1);
  // Caret to restore after we programmatically rewrite the textarea value.
  const pendingCaret = useRef<number | null>(null);
  // The focus request we've already scrolled to, so we don't keep hijacking
  // the scroll position on later renders (e.g. after sending a new message).
  const handledFocus = useRef<number | null>(null);

  // Load the thread whenever a different candidate opens. A token guards
  // against a slow fetch resolving after the user switched candidates.
  const loadToken = useRef(0);
  useEffect(() => {
    if (candidateId == null) return;
    const token = ++loadToken.current;
    setLoading(true);
    setMessages([]);
    setBody('');
    setTagged(new Set());
    setMenu(null);
    handledFocus.current = null;
    loadThread(candidateId)
      .then((rows) => {
        if (loadToken.current === token) setMessages(rows);
      })
      .catch(() => {
        /* leave empty; a resend or reopen will retry */
      })
      .finally(() => {
        if (loadToken.current === token) setLoading(false);
      });
  }, [candidateId]);

  // Scroll behaviour: when opened from a notification, scroll the tagged
  // message into view and flash it once; otherwise keep the transcript pinned
  // to the latest message. Runs after messages load so the target exists.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const wantFocus =
      focusMessageId != null && focusMessageId !== handledFocus.current;
    if (wantFocus && !loading) {
      const target = el.querySelector<HTMLElement>(
        `[data-mid="${focusMessageId}"]`
      );
      if (target) {
        handledFocus.current = focusMessageId!;
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        target.classList.add('chat-msg-focus');
        window.setTimeout(
          () => target.classList.remove('chat-msg-focus'),
          2200
        );
        return;
      }
      // Target not rendered yet — wait for the thread to finish loading.
      return;
    }
    el.scrollTop = el.scrollHeight;
  }, [messages, loading, focusMessageId]);

  // Restore the caret after an autocomplete insertion rewrites the value.
  useLayoutEffect(() => {
    if (pendingCaret.current != null && taRef.current) {
      taRef.current.selectionStart = taRef.current.selectionEnd =
        pendingCaret.current;
      pendingCaret.current = null;
      taRef.current.focus();
    }
  });

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setBody(value);
    setMenu(activeMention(value, e.target.selectionStart ?? value.length));
  }

  function pick(user: User) {
    if (!menu) return;
    const caret = taRef.current?.selectionStart ?? body.length;
    const before = body.slice(0, menu.start);
    const after = body.slice(caret);
    const insert = `@${displayName(user)} `;
    const next = before + insert + after;
    pendingCaret.current = (before + insert).length;
    setBody(next);
    setTagged((prev) => new Set(prev).add(user.id));
    setMenu(null);
  }

  const suggestions = menu
    ? users
        .filter((u) => currentUserId == null || u.id !== currentUserId)
        .filter((u) => {
          const q = menu.query.toLowerCase();
          if (!q) return true;
          return (
            displayName(u).toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q)
          );
        })
        .slice(0, 6)
    : [];

  const send = useCallback(() => {
    const text = body.trim();
    if (!text || candidateId == null || currentUser == null || sending) return;
    // Only tag users whose `@name` token still survives in the final text,
    // matched at a token boundary so a shorter name can't ride along inside a
    // longer one's token.
    const tagList = users.filter(
      (u) => tagged.has(u.id) && mentionPresent(text, displayName(u))
    );
    const mentionIds = tagList.map((u) => u.id);
    const mentionNames = tagList.map((u) => ({
      userId: u.id,
      name: displayName(u)
    }));

    const temp = tempId.current--;
    const optimistic: ChatMessage = {
      id: temp,
      candidateId,
      authorId: currentUser.id,
      authorName: displayName(currentUser),
      authorInitials: initials(currentUser),
      body: text,
      createdAt: new Date().toISOString(),
      mentions: mentionNames
    };
    setMessages((m) => [...m, optimistic]);
    setBody('');
    setTagged(new Set());
    setMenu(null);
    setSending(true);
    const fail = () => {
      // Drop the optimistic row and restore the draft so the transcript stays
      // truthful and the user doesn't silently lose their message.
      setMessages((m) => m.filter((x) => x.id !== temp));
      setBody(text);
    };
    postMessage(candidateId, text, mentionIds)
      .then((saved) => {
        // A null result means the server rejected the post (e.g. the session
        // could not be resolved) — treat it as a failure, not a no-op.
        if (saved) {
          setMessages((m) => m.map((x) => (x.id === temp ? saved : x)));
        } else {
          fail();
        }
      })
      .catch(fail)
      .finally(() => setSending(false));
  }, [body, candidateId, currentUser, sending, tagged, users]);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      send();
    }
  }

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
              <button
                className="btn primary"
                onClick={send}
                disabled={sending || !body.trim()}
              >
                Send
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
