import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { assembleUnifiedPrompt } from '@/lib/compiler/assembler/PromptAssembler';
import { ToolPlanner } from '@/lib/compiler/planners/ToolPlanner';
import { checkContracts, contractScore } from '@/lib/pipeline/contracts/promptContracts';
import { DOMAIN_FIXTURES } from './fixtures';
import type { BusinessSpecification } from '@/lib/llm/types';

/**
 * Tier 1: the anti-overfitting gate.
 *
 * Deterministic — asserts on `assembleUnifiedPrompt`, a pure function, so it needs
 * no LLM, no API key, and no mocks, and can therefore gate every commit. (The old
 * harness ran the whole LLM pipeline, which is why it was permanently skipped and
 * only ever asserted `promptLength > 0`.)
 *
 * The contracts are universal, so a fix that only helps one domain shows up here as
 * a failure in the others.
 */
describe('Contract harness — every fixture must satisfy every universal contract', () => {
  beforeAll(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterAll(() => vi.restoreAllMocks());

  // Tools are planned deterministically (ToolPlanner makes no LLM calls), so the
  // whole fixture -> prompt path here is reproducible.
  async function build(spec: BusinessSpecification) {
    const withTools = { ...spec, tools: await ToolPlanner.planTools(spec) } as BusinessSpecification;
    const draft = { dynamicVariables: spec.dynamicVariables || [] };
    return { prompt: assembleUnifiedPrompt(withTools, draft), spec: withTools };
  }

  describe.each(DOMAIN_FIXTURES.map(f => [f.id, f] as const))('%s', (_id, fixture) => {
    it('emits no critical contract violations', async () => {
      const { prompt, spec } = await build(fixture.spec);
      const violations = checkContracts({ prompt, spec, transcript: fixture.transcript });
      const critical = violations.filter(v => v.severity === 'critical');
      expect(critical.map(v => `${v.contract}: ${v.description}`)).toEqual([]);
    });

    it('scores acceptably against the universal contracts', async () => {
      const { prompt, spec } = await build(fixture.spec);
      const score = contractScore(checkContracts({ prompt, spec, transcript: fixture.transcript }));
      expect(score).toBeGreaterThanOrEqual(70);
    });

    it('satisfies its domain-specific expectations', async () => {
      const { prompt } = await build(fixture.spec);
      for (const needle of fixture.expect.mustContain || []) {
        expect(prompt, `expected prompt to contain "${needle}"`).toContain(needle);
      }
      for (const pattern of fixture.expect.mustNotContain || []) {
        expect(prompt, `expected prompt NOT to match ${pattern}`).not.toMatch(pattern);
      }
    });
  });

  it('covers more than one language and both call directions', () => {
    const langs = new Set(DOMAIN_FIXTURES.map(f => f.spec.meta.languageMode));
    const directions = new Set(DOMAIN_FIXTURES.map(f => (f.spec.meta as { callDirection?: string }).callDirection));
    // Guards against the previous state: 6/6 fixtures English, so every Devanagari
    // regression was invisible.
    expect(langs.size).toBeGreaterThanOrEqual(2);
    expect(directions.size).toBeGreaterThanOrEqual(2);
  });
});
