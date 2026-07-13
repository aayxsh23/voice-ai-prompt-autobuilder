import { NextResponse } from 'next/server';
import { MultiDomainTestHarness } from '@/lib/testing/MultiDomainTestHarness';
import { apiHandler, ApiError } from '@/lib/apiHandler';
import { rateLimit, clientKey } from '@/lib/rateLimit';

export const GET = apiHandler(async (req: Request) => {
  // Runs the full compile pipeline across every canonical scenario (many LLM
  // calls) — rate-limit tightly.
  if (!rateLimit(`test-harness:${clientKey(req)}`, 2, 60_000)) {
    throw new ApiError(429, 'Too many requests. Please wait a moment and try again.');
  }
  const harness = new MultiDomainTestHarness();
  const summary = await harness.runAllScenarios();
  return NextResponse.json(summary);
});
