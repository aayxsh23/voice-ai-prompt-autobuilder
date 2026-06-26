import { NextResponse } from 'next/server';
import { getLlmClient } from '@/lib/llm/llmClient';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const llm = getLlmClient();
    const res = await llm.runGapAudit({
      business: body.business || {},
      mission: body.mission || {},
      conversation: body.conversation || {},
      personality: body.personality || {}
    });
    if (res && res.missingCriticalDetails) {
      res.missingCriticalDetails = res.missingCriticalDetails.slice(0, 7);
    }
    return NextResponse.json(res);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
