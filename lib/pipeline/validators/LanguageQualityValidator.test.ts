import { describe, it, expect } from 'vitest';
import { validateLanguageQuality } from './LanguageQualityValidator';

const devFemale = { mode: 'hindi', script: 'devanagari', agentGender: 'female' };

describe('validateLanguageQuality', () => {
  it('flags romanized Hindi leaking into a Devanagari line', () => {
    const res = validateLanguageQuality('Say: "नमस्ते, aap kaise hain?"', devFemale);
    expect(res.isValid).toBe(false);
    expect(res.warnings && res.warnings.length).toBeGreaterThan(0);
    expect(res.score).toBeLessThan(100);
  });

  it('passes clean Devanagari with a perfect score', () => {
    const res = validateLanguageQuality('Say: "नमस्ते, आप कैसे हैं?"', devFemale);
    expect(res.isValid).toBe(true);
    expect(res.score).toBe(100);
  });

  it('ignores romanized text entirely for a latin-script (English) deployment', () => {
    const res = validateLanguageQuality('Say: "hello, how are you"', {
      mode: 'english',
      script: 'latin',
      agentGender: 'female',
    });
    expect(res.isValid).toBe(true);
  });

  it('flags a feminine verb form when the agent is male', () => {
    const res = validateLanguageQuality('Say: "मैं बात कर रही हूँ।"', {
      mode: 'hindi',
      script: 'devanagari',
      agentGender: 'male',
    });
    expect(res.isValid).toBe(false);
    expect(res.warnings?.some((w) => /male/i.test(w))).toBe(true);
  });
});
