import { describe, it, expect, vi, beforeEach } from 'vitest';

// allowlist.ts reads the db directly, so we mock that boundary. The point is the
// pure rules on top: normalizeEmail's shaping and isEmailAllowed's row → boolean.

const orderByResult = vi.fn<() => Promise<unknown[]>>();
const limitResult = vi.fn<() => Promise<unknown[]>>();

vi.mock('@/lib/db', () => ({
  allowedEmails: { id: {}, email: {} },
  db: {
    select: () => ({
      from: () => ({
        orderBy: () => orderByResult(),
        where: () => ({ limit: () => limitResult() })
      })
    })
  }
}));

import {
  normalizeEmail,
  getAllowedEmails,
  isEmailAllowed
} from '@/lib/allowlist';

beforeEach(() => {
  orderByResult.mockReset();
  limitResult.mockReset();
  orderByResult.mockResolvedValue([]);
  limitResult.mockResolvedValue([]);
});

describe('normalizeEmail', () => {
  it('trims surrounding whitespace and lowercases', () => {
    expect(normalizeEmail('  Foo@Bar.COM  ')).toBe('foo@bar.com');
  });

  it('leaves an already-normalized email unchanged', () => {
    expect(normalizeEmail('a@b.com')).toBe('a@b.com');
  });
});

describe('getAllowedEmails', () => {
  it('returns the ordered rows from the query', async () => {
    const rows = [
      { id: 1, email: 'a@b.com' },
      { id: 2, email: 'c@d.com' }
    ];
    orderByResult.mockResolvedValue(rows);
    expect(await getAllowedEmails()).toEqual(rows);
  });
});

describe('isEmailAllowed', () => {
  it('is true when the query finds a row', async () => {
    limitResult.mockResolvedValue([{ id: 1 }]);
    expect(await isEmailAllowed('allowed@x.com')).toBe(true);
  });

  it('is false when the query finds nothing', async () => {
    limitResult.mockResolvedValue([]);
    expect(await isEmailAllowed('nope@x.com')).toBe(false);
  });
});
