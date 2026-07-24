'use client';

// The per-applicant discussion thread's state + behaviour, extracted from ChatPanel. Message list is a TanStack Query cache keyed by candidate id; send is an optimistic useMutation.

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
  // The focus request we've already scrolled to, so later renders don't re-hijack scroll.
  const handledFocus = useRef<number | null>(null);

  // The thread for the open candidate, keyed by candidate id so a stale fetch can't clobber the new view.
  const { data: messages = [], isLoading } = useQuery({
    queryKey: hiringKeys.chat(candidateId ?? 0),
    queryFn: () => loadThread(candidateId as number),
    enabled: candidateId != null,
    staleTime: Infinity
  });
  const loading = candidateId != null && isLoading;

  // Reset the compose draft when a different candidate opens.
  useEffect(() => {
    setBody('');
    setMenu(null);
    handledFocus.current = null;
  }, [candidateId]);

  // Reset the highlighted autocomplete row when the mention query changes.
  useEffect(() => {
    setActive(0);
  }, [menu?.start, menu?.query]);

  // Scroll: focus + flash the tagged message when opened from a notification, else pin to the latest.
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

  // Optimistic send: append a temp row, swap in the saved row on success, roll back + restore the draft on failure.
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
    // Tag every user whose @name token appears in the final text, so a mention typed by keyboard is tagged too (not just autocomplete picks).
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
    // While the @-autocomplete is open, arrows drive it and Enter/Tab accept the row (Escape dismisses).
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
