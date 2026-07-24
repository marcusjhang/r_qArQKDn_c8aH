// Chat @-mention text rules (token detection, composer autocomplete, highlight pattern). Pure string/regex logic, kept out of the components so it stays testable.

import { displayName } from './users';
import type { User } from '../types';

/** Short, locale-friendly timestamp shared by the chat and notification UIs. */
export function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

/** Escape a string for safe embedding in a RegExp. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whether an `@name` token for `name` appears in `text` as a whole token, so "Ann" doesn't match inside "@Anna". */
export function mentionPresent(text: string, name: string): boolean {
  const re = new RegExp('@' + escapeRe(name) + '(?![\\p{L}\\d])', 'u');
  return re.test(text);
}

/** A global regex matching `@name` tokens for any of `names`, longest first so "@Ben Ong" wins over "@Ben"; a trailing boundary stops "@Ben" matching in "@Bennett". Null when there's nothing to highlight. */
export function mentionHighlightPattern(names: string[]): RegExp | null {
  if (!names.length) return null;
  const alternation = names
    .map(escapeRe)
    .sort((a, b) => b.length - a.length)
    .join('|');
  return new RegExp('@(' + alternation + ')(?![\\p{L}\\d])', 'gu');
}

/** Find the active `@query` token just before the caret. Returns the partial query and the leading `@` offset so an accepted pick can splice the name in. */
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

/** The @-mention autocomplete suggestions: board users minus the author, name/email substring-matched (empty query matches all), capped at 6. */
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
