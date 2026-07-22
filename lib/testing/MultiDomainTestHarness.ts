import { compilePromptPackage } from "@/lib/pipeline/promptCompiler";
import { checkContracts, contractScore } from "@/lib/pipeline/contracts/promptContracts";
import { lintPrompt, dialogueScore } from "@/lib/pipeline/dialogue/dialogueLint";
import { validatePromptBudget } from "@/lib/pipeline/validators/PromptBudgetValidator";
import { resolveLanguagePolicy } from "@/lib/llm/language/LanguagePolicy";
import { DOMAIN_FIXTURES, type DomainFixture } from "./fixtures";
import type { BusinessSpecification } from "@/lib/llm/types";

/**
 * Tier 2 — the quality harness.
 *
 * Runs the REAL pipeline (planners, CoT draft, judge loop) over every domain fixture
 * and reports a scorecard. Unlike Tier 1 (MultiDomainTestHarness.contract.test.ts)
 * this makes many live LLM calls, so it cannot gate every commit — it is a trend
 * line you run deliberately.
 *
 * It shares the fixtures and contracts with Tier 1 on purpose: the two tiers differ
 * only in whether the flow is generated or pre-supplied, never in what "good" means.
 */
export interface DomainScorecard {
  id: string;
  name: string;
  /** 0-100 against the universal contracts. */
  contractScore: number;
  /** 0-100 for how human the spoken lines read. */
  dialogueScore: number;
  /** 0-100 from the judge (deterministic contracts + LLM rubric). */
  judgeScore: number | null;
  criticalCount: number;
  majorCount: number;
  estimatedTokens: number;
  /** e.g. "7/7" — how many required stages the planner actually produced. */
  stageCoverage: string;
  /** Contract + expectation failures, most severe first. */
  violations: string[];
  passed: boolean;
  error?: string;
}

export interface TestHarnessSummary {
  totalScenarios: number;
  passedCount: number;
  failedCount: number;
  averageContractScore: number;
  averageDialogueScore: number;
  results: DomainScorecard[];
}

/** A scenario is "passing" when nothing critical survived and quality holds up. */
const PASS_CONTRACT_SCORE = 70;

export class MultiDomainTestHarness {
  private async runScenario(fixture: DomainFixture): Promise<DomainScorecard> {
    const base: DomainScorecard = {
      id: fixture.id, name: fixture.name,
      contractScore: 0, dialogueScore: 0, judgeScore: null,
      criticalCount: 0, majorCount: 0, estimatedTokens: 0,
      stageCoverage: '0/0', violations: [], passed: false,
    };

    try {
      // Clear the steps so the planner has to build the flow — that is the thing
      // Tier 2 exists to measure. Tier 1 supplies steps and tests the assembler.
      const spec = {
        ...fixture.spec,
        callFlowPlan: { ...fixture.spec.callFlowPlan, steps: [], fsmStates: [] },
      } as BusinessSpecification;

      const draft = await compilePromptPackage({
        businessSpec: spec,
        transcript: fixture.transcript,
      } as Parameters<typeof compilePromptPackage>[0]);

      const prompt = draft.finalPrompt || '';
      const finalSpec = draft.businessSpec || spec;
      const policy = resolveLanguagePolicy(finalSpec, draft);

      const violations = checkContracts({ prompt, spec: finalSpec, transcript: fixture.transcript, policy });
      const lint = lintPrompt(prompt);

      const required = finalSpec.callFlowPlan?.requiredStages || [];
      const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
      const activeStates = finalSpec.callFlowPlan?.fsmStates || finalSpec.callFlowPlan?.steps || [];
      const stateTokens = activeStates.map((s: any) => norm(`${s.id || s.stateId} ${s.stateName || s.objective}`));
      const covered = required.filter(r => stateTokens.some(t => t.includes(norm(r.id)))).length;

      const expectationFailures: string[] = [];
      for (const needle of fixture.expect.mustContain || []) {
        if (!prompt.includes(needle)) expectationFailures.push(`expected prompt to contain "${needle}"`);
      }
      for (const pattern of fixture.expect.mustNotContain || []) {
        if (pattern.test(prompt)) expectationFailures.push(`expected prompt NOT to match ${pattern}`);
      }

      const criticalCount = violations.filter(v => v.severity === 'critical').length;
      const majorCount = violations.filter(v => v.severity === 'major').length;
      const cScore = contractScore(violations);

      return {
        ...base,
        contractScore: cScore,
        dialogueScore: dialogueScore(lint),
        judgeScore: draft.judgeReport?.score ?? null,
        criticalCount,
        majorCount,
        estimatedTokens: validatePromptBudget(prompt).score ?? 0,
        stageCoverage: `${covered}/${required.length}`,
        violations: [
          ...violations
            .sort((a, _b) => (a.severity === 'critical' ? -1 : 1))
            .map(v => `[${v.severity}] ${v.contract}: ${v.description}`),
          ...expectationFailures.map(e => `[expectation] ${e}`),
        ],
        passed: criticalCount === 0 && cScore >= PASS_CONTRACT_SCORE && expectationFailures.length === 0,
      };
    } catch (err) {
      return { ...base, error: `Compilation threw: ${(err as Error)?.message || String(err)}` };
    }
  }

  async runAllScenarios(): Promise<TestHarnessSummary> {
    const results: DomainScorecard[] = [];
    for (const fixture of DOMAIN_FIXTURES) {
      results.push(await this.runScenario(fixture));
    }
    const passedCount = results.filter(r => r.passed).length;
    const avg = (pick: (r: DomainScorecard) => number) =>
      results.length === 0 ? 0 : Math.round(results.reduce((s, r) => s + pick(r), 0) / results.length);

    return {
      totalScenarios: results.length,
      passedCount,
      failedCount: results.length - passedCount,
      averageContractScore: avg(r => r.contractScore),
      averageDialogueScore: avg(r => r.dialogueScore),
      results,
    };
  }
}
