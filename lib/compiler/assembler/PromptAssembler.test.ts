import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  getSemanticCore,
  semanticDedupSlots,
  assembleUnifiedPrompt,
} from './PromptAssembler';
import type { BusinessSpecification } from '@/lib/llm/types';

describe('getSemanticCore', () => {
  it('strips a leading role qualifier', () => {
    expect(getSemanticCore('caller_name')).toBe('name');
  });

  it('strips a leading qualifier and keeps a semantic suffix', () => {
    expect(getSemanticCore('preferred_callback_time')).toBe('callback_time');
  });

  it('is idempotent for a bare slot', () => {
    expect(getSemanticCore('email')).toBe('email');
  });
});

describe('semanticDedupSlots', () => {
  it('collapses a qualified duplicate onto its core', () => {
    expect(semanticDedupSlots(['name', 'caller_name'])).toEqual(['name']);
  });

  it('keeps genuinely distinct slots', () => {
    expect(semanticDedupSlots(['email', 'phone']).sort()).toEqual(['email', 'phone']);
  });
});

describe('assembleUnifiedPrompt', () => {
  // The assembler is chatty by design; silence it so test output stays readable.
  beforeAll(() => vi.spyOn(console, 'log').mockImplementation(() => undefined));
  afterAll(() => vi.restoreAllMocks());

  const spec: BusinessSpecification = {
    meta: {
      companyName: 'Acme Dental',
      agentName: 'Riya',
      industry: 'Healthcare',
      isRegulated: false,
      toneProfile: ['Professional'],
      primaryGoal: 'Book patient appointments',
      languageMode: 'english',
    },
    businessSnapshot: {
      operatingHours: '9 to 5',
      servicesOffered: ['Cleaning'],
      policies: { cancellation: 'x', refunds: 'y', escalationNumbers: [] },
    },
    callFlowPlan: {
      steps: [
        {
          sequenceOrder: 1,
          stateId: 'greet',
          stateName: 'Greeting',
          scriptDirective: 'Say: "Hi"',
          slotsToCollect: [],
          branchingConditions: [],
        },
      ],
    },
    knowledgeBase: { faqs: [{ question: 'Hours?', answer: 'Nine to five.' }], objections: [] },
    tools: [],
  };

  it('emits the canonical section headers in order', () => {
    const out = assembleUnifiedPrompt(spec, { dynamicVariables: [] });
    expect(out).toContain('### AGENT IDENTITY & PERSONA');
    expect(out).toContain('### CALL FLOW');
    expect(out).toContain('### FAQ (FREQUENTLY ASKED QUESTIONS)');
    expect(out.indexOf('### AGENT IDENTITY & PERSONA')).toBeLessThan(out.indexOf('### CALL FLOW'));
  });

  it('injects the company and agent identity', () => {
    const out = assembleUnifiedPrompt(spec, { dynamicVariables: [] });
    expect(out).toContain('Acme Dental');
    expect(out).toContain('Riya');
  });
});
