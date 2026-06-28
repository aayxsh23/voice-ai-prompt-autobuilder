import { NextResponse } from 'next/server';
import { getLlmClient } from '@/lib/llm/llmClient';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages, currentBlueprint } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 });
    }

    const llm = getLlmClient();
    const result = await llm.generateBuilderChatReply(messages, currentBlueprint || {});

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error in /api/builder/chat:', error);
    return NextResponse.json({ error: error.message || 'Failed to process chat turn' }, { status: 500 });
  }
}
