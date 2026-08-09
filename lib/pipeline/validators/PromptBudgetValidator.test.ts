import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  validatePromptBudget,
  DEFAULT_PROMPT_TOKEN_BUDGET,
} from './PromptBudgetValidator';

describe('estimateTokens', () => {
  it('returns 0 for empty input', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('estimates ASCII at roughly chars/4', () => {
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });

  it('weights Devanagari more heavily than ASCII', () => {
    const dev = 'क'.repeat(100);
    const ascii = 'a'.repeat(100);
    expect(estimateTokens(dev)).toBeGreaterThan(estimateTokens(ascii));
  });
});

describe('validatePromptBudget', () => {
  it('passes a lean prompt with no warnings', () => {
    const res = validatePromptBudget('short prompt', 6000);
    expect(res.isValid).toBe(true);
    expect(res.warnings).toHaveLength(0);
  });

  it('warns when token budget is exceeded', () => {
    const big = 'a'.repeat(6000 * 4 + 4); // ~6001 tokens
    const res = validatePromptBudget(big, DEFAULT_PROMPT_TOKEN_BUDGET);
    expect(res.isValid).toBe(true);
    expect(res.warnings && res.warnings.length).toBe(1);
    expect(res.score).toBeGreaterThan(DEFAULT_PROMPT_TOKEN_BUDGET);
  });
});
