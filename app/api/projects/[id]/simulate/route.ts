import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getLlmClient } from '@/lib/llm/llmClient';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const project = await prisma.promptProject.findUnique({ where: { id } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const llm = getLlmClient();
    const result = await llm.simulatePromptTurn({
      callerMessage: body.callerMessage || "",
      persona: body.persona || "easy caller",
      currentAgentPrompt: project.agentPrompt,
      currentSystemPrompt: project.systemPrompt,
      conversationHistory: body.conversationHistory || []
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
