import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ai.ts is a thin I/O shell over one Anthropic structured-output call. We mock
// the SDK so no network request is made and drive `messages.create` directly,
// asserting the request/return contract: it is gated on ANTHROPIC_API_KEY and
// funnels the model's JSON through the shared normalizeTraitSuggestions rule
// (dedupe / word-count / length / cap). `server-only` is stubbed by
// vitest.config.ts, so importing ai.ts here is fine.

const create = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create };
  }
}));

import { suggestTraits, traitAiEnabled } from '@/lib/hiring/ai';

/** A model response carrying a single text block of `{ traits }` JSON. */
function textResponse(traits: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify({ traits }) }] };
}

beforeEach(() => {
  create.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('traitAiEnabled', () => {
  it('is true when ANTHROPIC_API_KEY is set', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
    expect(traitAiEnabled()).toBe(true);
  });

  it('is false when ANTHROPIC_API_KEY is unset', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    expect(traitAiEnabled()).toBe(false);
  });
});

describe('suggestTraits', () => {
  it('throws when the AI backend is not configured', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    await expect(suggestTraits('Engineer', 'JD')).rejects.toThrow(
      'AI suggestions are not configured.'
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('normalizes the model list (dedupe + cap) when configured', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
    create.mockResolvedValue(
      textResponse([
        'Ownership',
        'ownership', // case-insensitive dup of the above → dropped
        'A',
        'B',
        'C',
        'D',
        'E' // 6 distinct valids → capped to 5
      ])
    );

    const result = await suggestTraits('Founding Engineer', 'Build things');

    expect(result).toEqual(['Ownership', 'A', 'B', 'C', 'D']);
  });

  it('sends a single user message to the configured model', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
    create.mockResolvedValue(textResponse(['Ownership']));

    await suggestTraits('Designer', 'Craft UI');

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.any(String),
        messages: [
          expect.objectContaining({ role: 'user', content: expect.any(String) })
        ]
      })
    );
  });

  it('returns [] when the response carries no text block', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
    create.mockResolvedValue({ content: [] });

    expect(await suggestTraits('Engineer', '')).toEqual([]);
  });

  it('returns [] when the text block is not valid JSON', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
    create.mockResolvedValue({ content: [{ type: 'text', text: 'not json' }] });

    expect(await suggestTraits('Engineer', '')).toEqual([]);
  });
});
