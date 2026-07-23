import { describe, it, expect } from 'vitest';
import {
  activeMention,
  mentionSuggestions,
  mentionPresent
} from '@/lib/hiring/helpers';
import type { User } from '@/lib/hiring/types';

const users: User[] = [
  { id: 1, firstName: 'Ben', lastName: 'Ong', email: 'benong@x.io' },
  { id: 2, firstName: 'Ben', lastName: 'Chan', email: 'benchan@x.io' },
  { id: 3, firstName: 'Heng Hong', lastName: 'Lee', email: 'hhl@x.io' }
];

describe('activeMention', () => {
  it('returns null when there is no @token before the caret', () => {
    expect(activeMention('hello world', 11)).toBeNull();
    expect(activeMention('email me@site', 13)).toBeNull(); // @ not at token start
  });

  it('detects a bare @ at the start', () => {
    expect(activeMention('@', 1)).toEqual({ query: '', start: 0 });
  });

  it('detects a partial query and reports the @ offset', () => {
    // "hi @Be" — caret at end (6); the @ is at index 3.
    expect(activeMention('hi @Be', 6)).toEqual({ query: 'Be', start: 3 });
  });

  it('only considers text up to the caret', () => {
    const text = 'hi @Ben there';
    // Caret sits right after "@Ben".
    expect(activeMention(text, 7)).toEqual({ query: 'Ben', start: 3 });
    // Caret after the space that closed the token — no active mention.
    expect(activeMention(text, 8)).toBeNull();
  });
});

describe('mentionSuggestions', () => {
  it('excludes the author', () => {
    const out = mentionSuggestions(users, '', 1).map((u) => u.id);
    expect(out).toEqual([2, 3]);
  });

  it('includes everyone when there is no author id', () => {
    expect(mentionSuggestions(users, '', null)).toHaveLength(3);
  });

  it('matches on name (case-insensitive)', () => {
    const out = mentionSuggestions(users, 'chan', null).map((u) => u.id);
    expect(out).toEqual([2]);
  });

  it('matches on email', () => {
    const out = mentionSuggestions(users, 'hhl@', null).map((u) => u.id);
    expect(out).toEqual([3]);
  });

  it('caps the list at 6', () => {
    const many: User[] = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      firstName: 'User',
      lastName: String(i),
      email: `u${i}@x.io`
    }));
    expect(mentionSuggestions(many, '', null)).toHaveLength(6);
  });
});

describe('mentionPresent', () => {
  it('matches a whole @name token', () => {
    expect(mentionPresent('hey @Ben Ong please', 'Ben Ong')).toBe(true);
  });

  it('does not match a shorter name inside a longer token', () => {
    expect(mentionPresent('hey @Bennett', 'Ben')).toBe(false);
  });
});
