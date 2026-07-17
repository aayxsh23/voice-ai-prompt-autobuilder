import { NextResponse } from 'next/server';
import { MultiDomainTestHarness } from '@/lib/testing/MultiDomainTestHarness';
import { apiHandler, ApiError } from '@/lib/apiHandler';
import { rateLimit, clientKey } from '@/lib/rateLimit';

/**
 * Tier-2 quality scorecard across every domain fixture. Runs the full compile
 * pipeline (many LLM calls) — rate-limit tightly. The deterministic gate is Tier 1,
 * which runs in CI and needs no endpoint.
 */
export const GET = apiHandler(async (req: Request) => {
  if (!rateLimit(`test-harness:${clientKey(req)}`, 2, 60_000)) {
    throw new ApiError(429, 'Too many requests. Please wait a moment and try again.');
  }
  const summary = await new MultiDomainTestHarness().runAllScenarios();
  return NextResponse.json({
    ...summary,
    // Surface the headline numbers first so the endpoint is readable at a glance.
    summary: {
      passed: `${summary.passedCount}/${summary.totalScenarios}`,
      averageContractScore: summary.averageContractScore,
      averageDialogueScore: summary.averageDialogueScore,
    },
  });
});
