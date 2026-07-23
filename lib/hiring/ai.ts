import 'server-only';

// AI trait recommender. Given a job title and (optionally) a pasted job
// description, asks Claude for a focused few important traits a hiring team should
// score candidates on. Kept intentionally small: one structured-output call,
// no streaming, no conversation state.
//
// Credentials come from the environment (ANTHROPIC_API_KEY, optional
// ANTHROPIC_BASE_URL for a gateway). The model is overridable via
// TRAIT_AI_MODEL and defaults to Claude Opus 4.8.

import Anthropic from '@anthropic-ai/sdk';
import { MAX_TRAIT_NAME, MAX_TRAIT_SUGGESTIONS } from './helpers';

const MODEL = process.env.TRAIT_AI_MODEL || 'claude-opus-4-8';

/** Whether the AI recommender is configured (an API key is present). */
function traitAiEnabled(): boolean {
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

/**
 * Recommend a few important traits for a role, ordered most-important-first.
 * Returns a de-duplicated, length-bounded list (≤ MAX_TRAIT_SUGGESTIONS).
 * Throws if the AI backend is not configured or the call fails.
 */
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
    `- Each trait is a short label of 1-4 words (e.g. "Systems design", ` +
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
  const raw = (parsed as { traits?: unknown })?.traits;
  if (!Array.isArray(raw)) return [];

  // Normalize: trim, drop empties/over-length (skip rather than truncate — a
  // truncated label is worse than a missing one), de-dupe case-insensitively,
  // and keep only the first few.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const t = item.trim();
    if (!t || t.length > MAX_TRAIT_NAME) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= MAX_TRAIT_SUGGESTIONS) break;
  }
  return out;
}
