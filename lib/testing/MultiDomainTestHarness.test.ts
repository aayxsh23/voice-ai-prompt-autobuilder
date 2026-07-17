import { describe, it, expect } from 'vitest';
import { MultiDomainTestHarness } from './MultiDomainTestHarness';
import { DOMAIN_FIXTURES } from './fixtures';

// Tier 2 exercises the full compile pipeline, which makes many live LLM calls.
// It is skipped in normal/CI runs; enable with RUN_LLM_TESTS=1 against a running
// Qwen endpoint (see .env). Tier 1 (MultiDomainTestHarness.contract.test.ts) is the
// deterministic gate that runs on every commit.
const runLlm = process.env.RUN_LLM_TESTS === '1';

describe('MultiDomainTestHarness (Tier 2 — quality scorecard)', () => {
  it('covers every domain fixture, across languages and both call directions', () => {
    const scenarios = DOMAIN_FIXTURES;
    expect(scenarios.length).toBeGreaterThanOrEqual(8);
    expect(scenarios.every(s => s.id && s.spec && s.transcript.length > 0)).toBe(true);

    const langs = new Set(scenarios.map(s => s.spec.meta.languageMode));
    const directions = new Set(scenarios.map(s => (s.spec.meta as { callDirection?: string }).callDirection));
    expect(langs.size).toBeGreaterThanOrEqual(2);
    expect(directions.size).toBeGreaterThanOrEqual(2);
  });

  it.runIf(runLlm)(
    'every domain compiles with no critical contract violations',
    async () => {
      const summary = await new MultiDomainTestHarness().runAllScenarios();

      // Report before asserting so a failure shows the whole picture, not just the
      // first domain to break.
      for (const r of summary.results) {
        // eslint-disable-next-line no-console
        console.log(
          `${r.passed ? 'PASS' : 'FAIL'} ${r.id.padEnd(22)} contract=${r.contractScore} dialogue=${r.dialogueScore} judge=${r.judgeScore ?? '-'} stages=${r.stageCoverage} tokens=${r.estimatedTokens}` +
          (r.error ? `\n  error: ${r.error}` : '') +
          r.violations.map(v => `\n  ${v}`).join(''),
        );
      }

      for (const r of summary.results) {
        expect(r.error, `${r.id} threw`).toBeUndefined();
        expect(r.criticalCount, `${r.id} has critical violations`).toBe(0);
        expect(r.contractScore, `${r.id} contract score`).toBeGreaterThanOrEqual(70);
        expect(r.dialogueScore, `${r.id} dialogue score`).toBeGreaterThanOrEqual(70);
      }
      expect(summary.failedCount).toBe(0);
    },
    600_000,
  );
});
