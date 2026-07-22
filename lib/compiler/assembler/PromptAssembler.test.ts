import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  getSemanticCore,
  semanticDedupSlots,
  assembleUnifiedPrompt,
  resolveEmergencyGuidance,
  resolveCurrencyGuidance,
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

describe('Regional Fail-Safes (Phase 4)', () => {
  it('emits exact emergency numbers when region is established', () => {
    expect(resolveEmergencyGuidance('IN')).toContain('call 112 for immediate physical danger');
    expect(resolveEmergencyGuidance('US')).toContain('call 911 for immediate danger');
  });

  it('emits fail-safe guidance when region is undefined or unestablished', () => {
    expect(resolveEmergencyGuidance(undefined)).toContain('Do NOT state a specific emergency number');
    expect(resolveCurrencyGuidance(undefined)).toContain('Do NOT assume or state a specific currency');
  });

  it('emits regional currency formats when region is established', () => {
    expect(resolveCurrencyGuidance('IN')).toContain('Indian Rupees (₹ / INR)');
    expect(resolveCurrencyGuidance('US')).toContain('US Dollars ($ / USD)');
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

  it('requires a tool signal before inferring slots (Phase 6)', () => {
    const specWithNoToolSignal: BusinessSpecification = {
      ...spec,
      callFlowPlan: {
        steps: [
          {
            sequenceOrder: 1,
            stateId: 'ask_phone',
            stateName: 'Ask Phone',
            scriptDirective: 'Say: "What is your mobile phone number?"',
            slotsToCollect: [],
            branchingConditions: [],
            invokesTools: [],
          },
        ],
      },
    };
    const outNoSignal = assembleUnifiedPrompt(specWithNoToolSignal, { dynamicVariables: [] });
    expect(outNoSignal).not.toContain('**Required Extractions:** Extract and record [phone_number]');

    const specWithToolSignal: BusinessSpecification = {
      ...spec,
      callFlowPlan: {
        steps: [
          {
            sequenceOrder: 1,
            stateId: 'ask_phone',
            stateName: 'Ask Phone',
            scriptDirective: 'Say: "What is your mobile phone number?"',
            slotsToCollect: [],
            branchingConditions: [],
            invokesTools: ['validate_digit_input'],
          },
        ],
      },
    };
    const outWithSignal = assembleUnifiedPrompt(specWithToolSignal, { dynamicVariables: [] });
    expect(outWithSignal).toContain('**Required Extractions:** Extract and record [phone_number]');
  });

  it('renders FSM new schema fields correctly without hardcoding retries', () => {
    const specWithFsm: BusinessSpecification = {
      ...spec,
      callFlowPlan: {
        fsmStates: [
          {
            id: 'TEST_FSM',
            objective: 'Test FSM schema',
            slotsToCollect: ['test_slot'],
            orderIndependent: true,
            notes: ['Test note'],
            transitions: []
          }
        ]
      }
    };
    const outFsm = assembleUnifiedPrompt(specWithFsm, { dynamicVariables: [] });
    expect(outFsm).toContain('- Order Independent: Fields can be collected in any order.');
    expect(outFsm).toContain('* Test note');
    expect(outFsm).not.toContain('Max Retries: 3');
  });
});
