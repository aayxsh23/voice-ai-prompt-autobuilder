import { describe, it, expect } from 'vitest';
import { MultiDomainTestHarness } from './MultiDomainTestHarness';

// This suite exercises the full compile pipeline, which makes live LLM calls.
// It is skipped in normal/CI runs; enable it with RUN_LLM_TESTS=1 against a
// running Qwen endpoint (see .env) when you want an end-to-end smoke test.
const runLlm = process.env.RUN_LLM_TESTS === '1';

describe('MultiDomainTestHarness canonical scenarios', () => {
  it('defines the canonical domain scenarios', () => {
    const scenarios = MultiDomainTestHarness.getCanonicalScenarios();
    expect(scenarios.length).toBeGreaterThanOrEqual(6);
    expect(scenarios.every((s) => s.domainId && s.blueprint)).toBe(true);
  });

  it.runIf(runLlm)(
    'compiles every scenario without throwing',
    async () => {
      const summary = await new MultiDomainTestHarness().runAllScenarios();
      expect(summary.totalScenarios).toBe(summary.results.length);
      for (const r of summary.results) {
        expect(r.promptLength).toBeGreaterThan(0);
      }
    },
    120_000,
  );
});
