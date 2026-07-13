import { describe, it, expect } from 'vitest';
import { resolveLanguagePolicy } from './LanguagePolicy';
import { detectAiDisclosure, detectAgentGender } from './personaExtract';
import type { BusinessSpecification } from '@/lib/llm/types';

const specWith = (meta: Record<string, unknown>): Partial<BusinessSpecification> =>
  ({ meta } as unknown as Partial<BusinessSpecification>);

describe('resolveLanguagePolicy', () => {
  it('english → Latin, not Hindi-primary', () => {
    const p = resolveLanguagePolicy(specWith({ languageMode: 'english' }), null);
    expect(p.script).toBe('latin');
    expect(p.isHindiOrHinglish).toBe(false);
    expect(p.mayUseHindi).toBe(false);
  });

  it('multilingual → English-primary (Latin) but may use Hindi', () => {
    const p = resolveLanguagePolicy(specWith({ languageMode: 'multilingual' }), null);
    expect(p.script).toBe('latin');
    expect(p.isHindiOrHinglish).toBe(false);
    expect(p.mayUseHindi).toBe(true);
  });

  it('hindi → Devanagari-primary', () => {
    const p = resolveLanguagePolicy(specWith({ languageMode: 'hindi' }), null);
    expect(p.script).toBe('devanagari');
    expect(p.isHindiOrHinglish).toBe(true);
  });

  it('hinglish script depends on the target TTS', () => {
    expect(resolveLanguagePolicy(specWith({ languageMode: 'hinglish', targetTTS: 'generic' }), null).script).toBe('latin');
    expect(resolveLanguagePolicy(specWith({ languageMode: 'hinglish', targetTTS: 'sarvam' }), null).script).toBe('devanagari');
  });

  it('REGRESSION: describing Hindi support does not flip a multilingual agent to Hindi-primary', () => {
    const spec = {
      meta: { languageMode: 'multilingual' },
      capturedTopics: [{ topic: 'language_preference', summary: 'supports english, hindi and hinglish' }],
      resolvedTopics: ['language_preference'],
    } as unknown as Partial<BusinessSpecification>;
    const p = resolveLanguagePolicy(spec, null);
    expect(p.isHindiOrHinglish).toBe(false);
    expect(p.script).toBe('latin');
  });

  it('carries through the aiDisclosure toggle', () => {
    expect(resolveLanguagePolicy(specWith({ languageMode: 'english', aiDisclosure: 'deny' }), null).aiDisclosure).toBe('deny');
    expect(resolveLanguagePolicy(specWith({ languageMode: 'english' }), null).aiDisclosure).toBe('disclose');
  });
});

describe('detectAiDisclosure', () => {
  it('detects an explicit "do not disclose it is an AI" instruction', () => {
    const clove = 'The AI should not disclose or imply in any way that it is an AI, automated system, virtual assistant, or bot.';
    expect(detectAiDisclosure(clove)).toBe('deny');
  });

  it('detects "present as a human representative"', () => {
    expect(detectAiDisclosure('begin naturally, as if the caller is a human representative from the company')).toBe('deny');
  });

  it('detects an explicit disclose instruction', () => {
    expect(detectAiDisclosure('please clearly state that you are an AI assistant at the start')).toBe('disclose');
  });

  it('returns undefined when nothing is said about it', () => {
    expect(detectAiDisclosure('we book dental appointments monday to friday')).toBeUndefined();
  });
});

describe('detectAgentGender', () => {
  it('detects explicit male/female persona', () => {
    expect(detectAgentGender('use a male voice for the agent')).toBe('male');
    expect(detectAgentGender('the agent should have a female voice')).toBe('female');
  });
  it('returns undefined when unspecified', () => {
    expect(detectAgentGender('the agent is called Chloe')).toBeUndefined();
  });
});
