// Pure text helpers for the chat feature: the @-mention autocomplete the
// composer drives and the short timestamp shared by the chat and notification
// UIs. Framework-free so they can be unit-tested without a DOM (see
// chat-mentions.test.ts).

import { displayName } from './users';
import type { User } from '../model/types';

/** Short, locale-friendly timestamp shared by the chat and notification UIs. */
export function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

/**
 * Whether an `@name` mention token for `name` appears in `text` as a whole
 * token — i.e. not immediately followed by another name character. This stops
 * a shorter name ("Ann") from matching inside a longer one's token ("@Anna").
 */
export function mentionPresent(text: string, name: string): boolean {
  const re = new RegExp(
    '@' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\p{L}\\d])',
    'u'
  );
  return re.test(text);
}

/**
 * Find the active `@query` token immediately before the caret, if any. Drives
 * the chat composer's @-mention autocomplete: returns the partial query and the
 * offset of the leading `@` so an accepted pick can splice the name in.
 */
export function activeMention(
  text: string,
  caret: number
): { query: string; start: number } | null {
  const upto = text.slice(0, caret);
  const m = upto.match(/(?:^|\s)@([\p{L}\d._-]*)$/u);
  if (!m) return null;
  const query = m[1];
  return { query, start: caret - query.length - 1 };
}

/**
 * The @-mention autocomplete suggestions for a query: the board's users minus
 * the author, name/email substring-matched (case-insensitive; empty query
 * matches all), capped at 6.
 */
export function mentionSuggestions(
  users: User[],
  query: string,
  currentUserId: number | null
): User[] {
  const q = query.toLowerCase();
  return users
    .filter((u) => currentUserId == null || u.id !== currentUserId)
    .filter((u) => {
      if (!q) return true;
      return (
        displayName(u).toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
      );
    })
    .slice(0, 6);
}
