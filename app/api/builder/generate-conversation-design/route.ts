import { NextResponse } from 'next/server';
import { getLlmClient } from '@/lib/llm/llmClient';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const llm = getLlmClient();
    const design = await llm.generateConversationDesign({
      template: body.template || 'Clinic Receptionist Prompt',
      business: body.business || {},
      mission: body.mission || {}
    });
    return NextResponse.json(design);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
