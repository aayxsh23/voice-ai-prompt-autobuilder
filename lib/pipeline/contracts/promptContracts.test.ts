import { describe, it, expect } from 'vitest';
import { checkContracts, contractScore } from './promptContracts';
import type { BusinessSpecification } from '@/lib/llm/types';

const baseSpec = {
  meta: { companyName: 'Acme', agentName: 'Sam', primaryGoal: 'Book appointments' },
  callFlowPlan: { steps: [] },
  knowledgeBase: { faqs: [], objections: [] },
  tools: [],
} as unknown as Partial<BusinessSpecification>;

const SAFE = '### MANDATORY EMERGENCY & SAFETY OVERRIDES\n- Direct callers to local emergency services.';

describe('stage_coverage', () => {
  const spec = {
    ...baseSpec,
    callFlowPlan: {
      steps: [{ sequenceOrder: 1, stateId: 'opening', stateName: 'Opening', scriptDirective: 'Say: "Hi"', slotsToCollect: [] }],
      requiredStages: [
        { id: 'opening', label: 'Opening' },
        { id: 'cross_sell_pitch', label: 'Cross-sell pitch' },
      ],
    },
  } as unknown as Partial<BusinessSpecification>;

  it('flags a described stage that has no state (the VLCC missing-pitch case)', () => {
    const v = checkContracts({ prompt: `${SAFE}\n### CALL FLOW\nSTATE: [opening] (Opening)`, spec });
    const missing = v.filter(x => x.contract === 'stage_coverage');
    expect(missing).toHaveLength(1);
    expect(missing[0].severity).toBe('critical');
    expect(missing[0].description).toContain('Cross-sell pitch');
  });

  it('passes when every stage has a state', () => {
    const prompt = `${SAFE}\n### CALL FLOW\nSTATE: [opening] (Opening)\nSTATE: [cross_sell_pitch] (Pitch)`;
    expect(checkContracts({ prompt, spec }).some(x => x.contract === 'stage_coverage')).toBe(false);
  });

  it('no-ops when the interview captured no stages', () => {
    const prompt = `${SAFE}\n### CALL FLOW\nSTATE: [x] (X)`;
    expect(checkContracts({ prompt, spec: baseSpec }).some(x => x.contract === 'stage_coverage')).toBe(false);
  });
});

describe('locale_grounded', () => {
  it('flags a US emergency number when no region is established', () => {
    const prompt = '### MANDATORY EMERGENCY & SAFETY OVERRIDES\n- call 911 for immediate danger';
    const v = checkContracts({ prompt, spec: baseSpec });
    expect(v.find(x => x.contract === 'locale_grounded')?.severity).toBe('critical');
  });

  it('flags a US number for a Qatar deployment', () => {
    const spec = { ...baseSpec, meta: { ...baseSpec.meta, region: 'QA' } } as Partial<BusinessSpecification>;
    const prompt = '### MANDATORY EMERGENCY & SAFETY OVERRIDES\n- call 911 for immediate danger';
    expect(checkContracts({ prompt, spec }).some(x => x.contract === 'locale_grounded')).toBe(true);
  });

  it('accepts the correct number for the declared region', () => {
    const spec = { ...baseSpec, meta: { ...baseSpec.meta, region: 'QA' } } as Partial<BusinessSpecification>;
    const prompt = '### MANDATORY EMERGENCY & SAFETY OVERRIDES\n- call 999 for emergency services in Qatar';
    expect(checkContracts({ prompt, spec }).some(x => x.contract === 'locale_grounded')).toBe(false);
  });

  it('accepts generic guidance with no region', () => {
    const prompt = `${SAFE}`;
    expect(checkContracts({ prompt, spec: baseSpec }).some(x => x.contract === 'locale_grounded')).toBe(false);
  });
});

describe('placeholders_declared', () => {
  it('flags an undeclared placeholder', () => {
    const spec = { ...baseSpec, dynamicVariables: [{ key: 'customer_name' }] } as unknown as Partial<BusinessSpecification>;
    const v = checkContracts({ prompt: `${SAFE}\nHello {{first_name}}`, spec });
    expect(v.find(x => x.contract === 'placeholders_declared')?.description).toContain('first_name');
  });
});

describe('tools_registered', () => {
  it('flags an unregistered tool invocation', () => {
    const spec = { ...baseSpec, tools: [{ name: 'end_call', description: '', parameters: {}, associatedStateId: '' }] } as unknown as Partial<BusinessSpecification>;
    const prompt = `${SAFE}\nInvoke \`transfer_call(reason: "x")\``;
    expect(checkContracts({ prompt, spec }).some(x => x.contract === 'tools_registered')).toBe(true);
  });

  it('accepts a registered tool', () => {
    const spec = { ...baseSpec, tools: [{ name: 'end_call', description: '', parameters: {}, associatedStateId: '' }] } as unknown as Partial<BusinessSpecification>;
    const prompt = `${SAFE}\nInvoke \`end_call(reason: "done")\``;
    expect(checkContracts({ prompt, spec }).some(x => x.contract === 'tools_registered')).toBe(false);
  });
});

describe('policies_rendered', () => {
  it('flags captured policies that never reached the prompt', () => {
    const spec = {
      ...baseSpec,
      callFlowPlan: { steps: [], interruptionPolicy: 'allow' },
    } as unknown as Partial<BusinessSpecification>;
    expect(checkContracts({ prompt: `${SAFE}\n### CALL FLOW\nSTATE: [x] (X)`, spec })
      .some(x => x.contract === 'policies_rendered')).toBe(true);
  });
});

describe('infields_referenced', () => {
  it('flags an infield that is never used', () => {
    const spec = {
      ...baseSpec,
      dynamicVariables: [{ key: 'existing_segment', fieldDirection: 'infield' }],
    } as unknown as Partial<BusinessSpecification>;
    expect(checkContracts({ prompt: SAFE, spec }).some(x => x.contract === 'infields_referenced')).toBe(true);
  });
});

describe('safety_block_present', () => {
  it('flags a prompt with no safety section', () => {
    expect(checkContracts({ prompt: '### CALL FLOW\nSTATE: [x] (X)', spec: baseSpec })
      .some(x => x.contract === 'safety_block_present')).toBe(true);
  });
});

describe('dialogue_quality contract', () => {
  it('surfaces instruction-as-speech through the shared linter', () => {
    const prompt = `${SAFE}\n### CALL FLOW\n* **Dialogue Directive:** Say: "Apologize and close."`;
    const v = checkContracts({ prompt, spec: baseSpec });
    expect(v.some(x => x.contract === 'dialogue:instruction_as_speech' && x.severity === 'critical')).toBe(true);
  });
});

describe('contractScore', () => {
  it('is 100 when clean and drops with severity', () => {
    expect(contractScore([])).toBe(100);
    expect(contractScore([{ contract: 'x', severity: 'critical', category: 'coverage', description: '', suggestedFix: '' }])).toBe(75);
  });
});
