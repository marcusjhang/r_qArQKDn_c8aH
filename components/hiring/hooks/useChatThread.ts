'use client';

// The per-applicant discussion thread's state + behaviour, extracted from
// ChatPanel so the component stays presentational. Owns: loading/holding the
// message list for the open candidate (with a token that ignores a slow fetch
// resolving after a candidate switch), the compose draft + optimistic send with
// rollback, and the @-mention autocomplete state (active token, tagged-account
// set, caret restoration after an insertion). The component supplies the refs'
// attachment points and renders what the hook exposes.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from 'react';
import { loadThread, postMessage } from '@/lib/hiring/chat/actions';
import {
  activeMention,
  displayName,
  initials,
  mentionPresent,
  mentionSuggestions
} from '@/lib/hiring/helpers';
import type { ChatMessage, User } from '@/lib/hiring/model/types';

export function useChatThread({
  candidateId,
  currentUser,
  currentUserId,
  users,
  focusMessageId
}: {
  candidateId: number | null;
  currentUser: User | null;
  currentUserId: number | null;
  users: User[];
  focusMessageId?: number | null;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [body, setBody] = useState('');
  // Accounts the author has picked from the @-autocomplete for this draft.
  const [tagged, setTagged] = useState<Set<number>>(new Set());
  const [menu, setMenu] = useState<{ start: number; query: string } | null>(
    null
  );
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
    ? mentionSuggestions(users, menu.query, currentUserId)
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

  return {
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
  };
}
