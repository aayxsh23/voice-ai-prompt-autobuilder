import { NextResponse } from 'next/server';
import { getLlmClient } from '@/lib/llm/llmClient';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const llm = getLlmClient();
    const draft = await llm.generateReviewDraft(body);
    return NextResponse.json(draft);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
