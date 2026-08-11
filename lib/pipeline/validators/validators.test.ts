import { describe, it, expect } from 'vitest';
import { validateFallbackDialogue } from './FallbackDialogueValidator';
import { validateVariableConsistency } from './VariableConsistencyValidator';
import { validateCoherence } from './CoherenceValidator';
import { validateFlowCompleteness } from './FlowCompletenessValidator';

describe.skip('validateFallbackDialogue', () => {
  it('accepts a fallback line that starts with Say:', () => {
    const res = validateFallbackDialogue('Fallback: Say: "Please repeat that."');
    expect(res.isValid).toBe(true);
  });

  it('flags a fallback line missing the spoken Say: prefix', () => {
    const res = validateFallbackDialogue('Fallback: just retry the question');
    expect(res.isValid).toBe(false);
    expect(res.errors).toHaveLength(1);
  });
});

describe('validateVariableConsistency', () => {
  it('flags an outfield never referenced inside the call flow', () => {
    const prompt = '### CALL FLOW\nSTATE: greet\nSay something generic.';
    const res = validateVariableConsistency(prompt, [
      { key: 'appointment_date', fieldDirection: 'outfield', source: 'extraction' },
    ]);
    expect(res.isValid).toBe(false);
  });

  it('passes when the outfield is referenced', () => {
    const prompt = '### CALL FLOW\nSTATE: collect\nRequired Extractions: [appointment_date]';
    const res = validateVariableConsistency(prompt, [
      { key: 'appointment_date', fieldDirection: 'outfield', source: 'extraction' },
    ]);
    expect(res.isValid).toBe(true);
  });
});

describe('validateCoherence', () => {
  it('passes when goal keywords appear in the prompt', () => {
    const res = validateCoherence('We help you with booking appointments.', {
      primaryGoal: 'booking appointments',
    });
    expect(res.isValid).toBe(true);
  });

  it('flags a prompt that ignores the primary goal', () => {
    const res = validateCoherence('totally unrelated text', {
      primaryGoal: 'schedule dental cleanings',
    });
    expect(res.isValid).toBe(false);
  });
});

describe('validateFlowCompleteness', () => {
  it('flags an empty flow', () => {
    const res = validateFlowCompleteness({}, []);
    expect(res.isValid).toBe(false);
    expect(res.errors[0]).toMatch(/no call flow/i);
  });

  it('accepts a single terminal step', () => {
    const res = validateFlowCompleteness({}, [
      {
        sequenceOrder: 1,
        stateId: 'closing',
        stateName: 'Close',
        scriptDirective: 'Say: "Goodbye"',
        slotsToCollect: [],
        isTerminal: true,
        branchingConditions: [{ condition: 'done', goToStep: 'end_call' }],
      } as never,
    ]);
    expect(res.isValid).toBe(true);
  });

  it('accepts FSM state nodes', () => {
    const res = validateFlowCompleteness({
      callFlowPlan: {
        fsmStates: [
          {
            id: 'collect_slots',
            objective: 'Collect info',
            slotsToCollect: ['slot1'],
            retryPolicy: { maxAttempts: 3, onExhausted: { targetStateId: 'end_call' } },
            edges: [{ condition: 'done', targetStateId: 'end_call' }]
          },
          {
            id: 'end_call',
            objective: 'Close call',
            entryAction: { tool: 'end_call', args: {} },
            edges: []
          }
        ]
      }
    } as Record<string, unknown>, []);
    expect(res.isValid).toBe(true);
  });
});
