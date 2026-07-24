'use client';

// The per-applicant discussion thread's state + behaviour, extracted from
// ChatPanel so the component stays presentational.
//
// The message list is a TanStack Query cache keyed by candidate id: switching
// candidates switches the key, so a slow fetch resolving after the user moved
// on is ignored automatically (no manual request token), and the loading flag
// is the query's own. Sending a message is a `useMutation` with the standard
// optimistic lifecycle — append a temp row in `onMutate`, swap it for the
// server row in `onSuccess`, roll back and restore the draft in `onError` (a
// null result, meaning the server rejected the post, is treated as a failure).
//
// The compose draft (`body`), the picked @-mention set (`tagged`), the
// autocomplete menu, and caret restoration are pure local UI state and stay in
// component state.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { loadThread, postMessage } from '@/lib/hiring/chat/actions';
import { hiringKeys } from '@/lib/hiring/query-keys';
import {
  activeMention,
  displayName,
  initials,
  mentionPresent,
  mentionSuggestions
} from '@/lib/hiring/helpers';
import type { ChatMessage, User } from '@/lib/hiring/types';

/** Variables for an optimistic send. */
interface SendVars {
  candidateId: number;
  text: string;
  mentionIds: number[];
  optimistic: ChatMessage;
  temp: number;
}

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
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const [menu, setMenu] = useState<{ start: number; query: string } | null>(
    null
  );
  // Highlighted row in the @-autocomplete, for keyboard navigation.
  const [active, setActive] = useState(0);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const tempId = useRef(-1);
  // Caret to restore after we programmatically rewrite the textarea value.
  const pendingCaret = useRef<number | null>(null);
  // The focus request we've already scrolled to, so we don't keep hijacking
  // the scroll position on later renders (e.g. after sending a new message).
  const handledFocus = useRef<number | null>(null);

  // The thread for the open candidate. Keyed by candidate id, so switching
  // candidates switches the cache slice — a fetch that resolves after the user
  // moved on lands on a key nobody is reading, and cannot clobber the new view.
  const { data: messages = [], isLoading } = useQuery({
    queryKey: hiringKeys.chat(candidateId ?? 0),
    queryFn: () => loadThread(candidateId as number),
    enabled: candidateId != null,
    staleTime: Infinity
  });
  const loading = candidateId != null && isLoading;

  // Reset the compose draft when a different candidate opens (the message list
  // itself is per-candidate via the query key).
  useEffect(() => {
    setBody('');
    setMenu(null);
    handledFocus.current = null;
  }, [candidateId]);

  // Reset the highlighted autocomplete row whenever the mention query changes
  // (a new `@…` token), so keyboard nav always starts at the top of the list.
  useEffect(() => {
    setActive(0);
  }, [menu?.start, menu?.query]);

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
    setMenu(null);
  }

  const suggestions = menu
    ? mentionSuggestions(users, menu.query, currentUserId)
    : [];

  // Optimistic send. onMutate appends the temp row; onSuccess swaps in the saved
  // row (or rolls back + restores the draft if the server rejected the post);
  // onError rolls back + restores the draft. Failure keeps the transcript
  // truthful and never silently loses the author's text.
  const { mutate: sendMessage, isPending: sending } = useMutation({
    mutationFn: ({ candidateId, text, mentionIds }: SendVars) =>
      postMessage(candidateId, text, mentionIds),
    onMutate: async ({ candidateId, optimistic }: SendVars) => {
      const key = hiringKeys.chat(candidateId);
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<ChatMessage[]>(key);
      queryClient.setQueryData<ChatMessage[]>(key, (m = []) => [
        ...m,
        optimistic
      ]);
      return { prev };
    },
    onSuccess: (saved, vars, ctx) => {
      const key = hiringKeys.chat(vars.candidateId);
      if (saved) {
        queryClient.setQueryData<ChatMessage[]>(key, (m = []) =>
          m.map((x) => (x.id === vars.temp ? saved : x))
        );
      } else {
        queryClient.setQueryData<ChatMessage[]>(key, ctx?.prev ?? []);
        setBody(vars.text);
      }
    },
    onError: (_err, vars, ctx) => {
      queryClient.setQueryData<ChatMessage[]>(
        hiringKeys.chat(vars.candidateId),
        ctx?.prev ?? []
      );
      setBody(vars.text);
    }
  });

  const send = useCallback(() => {
    const text = body.trim();
    if (!text || candidateId == null || currentUser == null || sending) return;
    // Tag every user whose `@name` token appears in the final text, matched at a
    // token boundary so a shorter name can't ride along inside a longer one's
    // token. Deriving the tag set from the text (rather than from what the mouse
    // picked) means a mention typed by keyboard is tagged too — the autocomplete
    // is a convenience, not the only way to mention someone.
    const tagList = users.filter((u) => mentionPresent(text, displayName(u)));
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
    setBody('');
    setMenu(null);
    sendMessage({ candidateId, text, mentionIds, optimistic, temp });
  }, [body, candidateId, currentUser, sending, users, sendMessage]);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // When the @-autocomplete is open, the arrow keys drive it and Enter/Tab
    // accept the highlighted row (Escape dismisses) — so a keyboard user can
    // complete a mention without a mouse.
    if (menu && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pick(suggestions[Math.min(active, suggestions.length - 1)]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMenu(null);
        return;
      }
    }
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
    active,
    setActive,
    sending,
    taRef,
    listRef,
    onChange,
    onKeyDown,
    pick,
    send
  };
}
