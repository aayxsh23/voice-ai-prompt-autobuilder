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

  // Regression: the tool JSON Schema used to be dropped on every platform (vapi
  // hardcoded an empty `properties`), so agents registered tools with no arguments.
  it('passes each tool JSON Schema through to every platform', () => {
    const schema = {
      type: 'object',
      properties: { field: { type: 'string' }, expected_digits: { type: 'integer' } },
      required: ['field'],
    };
    const withSchema = {
      ...draft,
      suggestedFunctions: [{ name: 'validate_digit_input', description: 'd', parameters: schema }],
    } as unknown as PromptPackageDraft;
    const a = new PlatformAdapter();

    expect(a.formatForPlatform(withSchema, 'vapi').configPayload.model.functions[0].parameters).toEqual(schema);
    expect(a.formatForPlatform(withSchema, 'retell').configPayload.general_tools[0].parameters).toEqual(schema);
    expect(a.formatForPlatform(withSchema, 'bland').configPayload.tools[0].input_schema).toEqual(schema);
  });
});
