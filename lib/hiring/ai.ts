import 'server-only';

// AI trait recommender: one structured-output Claude call (no streaming/state) for a role's important traits. Config via env — ANTHROPIC_API_KEY, optional ANTHROPIC_BASE_URL, model overridable via TRAIT_AI_MODEL.

import Anthropic from '@anthropic-ai/sdk';
import {
  MAX_TRAIT_NAME,
  MAX_TRAIT_SUGGESTIONS,
  normalizeTraitSuggestions
} from './helpers';

const MODEL = process.env.TRAIT_AI_MODEL || 'claude-opus-4-8';

/** Whether the AI recommender is configured (an API key is present), so the UI can hide the "Suggest from JD" affordance when there's no key. */
export function traitAiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// JSON Schema constraining the response to a short list of trait strings.
const TRAIT_SCHEMA = {
  type: 'object',
  properties: {
    traits: {
      type: 'array',
      items: { type: 'string' }
    }
  },
  required: ['traits'],
  additionalProperties: false
} as const;

/** Recommend a few important traits for a role, most-important-first (deduped, ≤ MAX_TRAIT_SUGGESTIONS). Throws if the AI backend is unconfigured or the call fails. */
export async function suggestTraits(
  title: string,
  description: string
): Promise<string[]> {
  if (!traitAiEnabled()) {
    throw new Error('AI suggestions are not configured.');
  }

  const client = new Anthropic();
  const jd = description.trim();

  const prompt =
    `You are helping a hiring team decide which candidate qualities to ` +
    `score for a role. Suggest ${MAX_TRAIT_SUGGESTIONS} important, distinct ` +
    `traits to look out for.\n\n` +
    `Rules:\n` +
    `- Order the list by importance, MOST important first — the order is the ` +
    `ranking and sets each trait's weight in the candidate's score.\n` +
    `- Each trait is a short label of 1-2 words (e.g. "Systems design", ` +
    `"Ownership"), at most ${MAX_TRAIT_NAME} characters.\n` +
    `- Tailor them to this specific role; avoid generic filler.\n` +
    `- No duplicates, no numbering, no descriptions.\n\n` +
    `Role title: ${title || '(untitled)'}\n` +
    (jd ? `Job description:\n${jd}` : `Job description: (none provided)`);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    output_config: {
      format: { type: 'json_schema', schema: TRAIT_SCHEMA }
    },
    messages: [{ role: 'user', content: prompt }]
  });

  const text = response.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.text);
  } catch {
    return [];
  }
  // The trim/length/dedupe/cap rule lives in one tested place; this stays a thin I/O shell.
  return normalizeTraitSuggestions((parsed as { traits?: unknown })?.traits);
}
