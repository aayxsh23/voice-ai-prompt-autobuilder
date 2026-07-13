import { describe, it, expect } from 'vitest';
import { selectFewShots, renderFewShots, fewShotBlock } from './index';

describe('selectFewShots', () => {
  it('returns English exemplars for an english policy', () => {
    const out = selectFewShots({ policy: { mode: 'english' } });
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((e) => e.language === 'english')).toBe(true);
  });

  it('returns Hinglish (Devanagari) exemplars for a hinglish policy', () => {
    const out = selectFewShots({ policy: { mode: 'hinglish' } });
    expect(out.every((e) => e.language === 'hinglish')).toBe(true);
    expect(out.some((e) => /[ऀ-ॿ]/.test(e.text))).toBe(true);
  });

  it('includes both registers for a multilingual policy', () => {
    const out = selectFewShots({ policy: { mode: 'multilingual' }, limit: 50 });
    expect(out.some((e) => e.language === 'english')).toBe(true);
    expect(out.some((e) => e.language === 'hinglish')).toBe(true);
  });

  it('filters by function and respects the limit', () => {
    const out = selectFewShots({ policy: { mode: 'english' }, functions: ['opening'] });
    expect(out.every((e) => e.fn === 'opening')).toBe(true);
    expect(selectFewShots({ policy: { mode: 'english' }, limit: 2 })).toHaveLength(2);
  });
});

describe('renderFewShots / fewShotBlock', () => {
  it('renders nothing for an empty list', () => {
    expect(renderFewShots([])).toBe('');
  });

  it('produces a STYLE EXEMPLARS block', () => {
    const block = fewShotBlock({ policy: { mode: 'hinglish' } });
    expect(block).toContain('STYLE EXEMPLARS');
    expect(block).toContain('Paraphrase');
  });
});
