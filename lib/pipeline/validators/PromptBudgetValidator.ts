import { ValidationResult } from "./types";

/** Default token budget for a single-flow voice-agent prompt. Exceeding it is a
 *  warning, not a hard failure — it flags a prompt that has grown token-heavy
 *  (the FITTR failure mode) so it can be tightened before it costs latency/spend
 *  on every single call. */
export const DEFAULT_PROMPT_TOKEN_BUDGET = 4000;

/**
 * Rough, dependency-free token estimate. Devanagari tokenizes far heavier than
 * ASCII on typical BPE tokenizers, so it is weighted separately. This is an
 * estimate for budgeting/warnings only, not an exact count.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const devanagari = text.match(/[ऀ-ॿ]/g)?.length ?? 0;
  const rest = text.length - devanagari;
  return Math.ceil(rest / 4 + devanagari * 0.75);
}

export function validatePromptBudget(
  promptString: string,
  maxTokens: number = DEFAULT_PROMPT_TOKEN_BUDGET,
): ValidationResult {
  const estimated = estimateTokens(promptString);
  const warnings: string[] = [];
  if (estimated > maxTokens) {
    warnings.push(
      `Prompt is token-heavy (~${estimated} tokens, budget ${maxTokens}). ` +
        `Tighten it: remove per-turn restatements, cross-references, and rationale prose. ` +
        `Every call pays this cost.`,
    );
  }
  return { isValid: true, errors: [], warnings, score: estimated };
}
