import { describe, it, expect } from 'vitest';
import { PlatformAdapter } from './PlatformAdapter';
import type { PromptPackageDraft } from '@/lib/llm/types';

const draft = {
  finalPrompt: 'PROMPT',
  primaryGoal: 'goal',
  suggestedFunctions: [{ name: 'book', description: 'books appointments' }],
  dynamicVariables: [],
} as unknown as PromptPackageDraft;

describe('PlatformAdapter', () => {
  it('formats for Bland', () => {
    const out = new PlatformAdapter().formatForPlatform(draft, 'bland');
    expect(out.platform).toBe('bland');
    expect(out.systemPrompt).toBe('PROMPT');
    expect(out.configPayload.prompt).toBe('PROMPT');
    expect(out.configPayload.tools[0].name).toBe('book');
  });

  it('formats for Retell, Vapi, and generic', () => {
    expect(new PlatformAdapter().formatForPlatform(draft, 'retell').configPayload.general_prompt).toBe('PROMPT');
    expect(new PlatformAdapter().formatForPlatform(draft, 'vapi').configPayload.model.messages[0].content).toBe('PROMPT');
    expect(new PlatformAdapter().formatForPlatform(draft, 'generic').configPayload.rawMarkdown).toBe('PROMPT');
  });

  it('defaults to generic', () => {
    expect(new PlatformAdapter().formatForPlatform(draft).platform).toBe('generic');
  });
});
