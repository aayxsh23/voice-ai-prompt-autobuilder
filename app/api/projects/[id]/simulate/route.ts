import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getLlmClient } from '@/lib/llm/llmClient';
import { apiHandler, ApiError } from '@/lib/apiHandler';
import { assertProjectOwner } from '@/lib/auth';

export const POST = apiHandler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await assertProjectOwner(id);
  const body = await req.json();
  const project = await prisma.promptProject.findUnique({ where: { id } });
  if (!project) throw new ApiError(404, "Project not found");

  const llm = getLlmClient();
  const result = await llm.simulatePromptTurn({
    callerMessage: body.callerMessage || "",
    persona: body.persona || "easy caller",
    currentAgentPrompt: project.finalPrompt,
    currentSystemPrompt: project.finalPrompt,
    conversationHistory: body.conversationHistory || []
  });

  return NextResponse.json(result);
});
