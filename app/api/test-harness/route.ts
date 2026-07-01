import { NextResponse } from 'next/server';
import { MultiDomainTestHarness } from '@/lib/testing/MultiDomainTestHarness';

export async function GET() {
  try {
    const harness = new MultiDomainTestHarness();
    const summary = await harness.runAllScenarios();
    return NextResponse.json(summary);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to run test harness" }, { status: 500 });
  }
}
