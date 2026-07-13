import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getLlmClient } from '@/lib/llm/llmClient';
import { apiHandler, ApiError } from '@/lib/apiHandler';
import { assertProjectOwner } from '@/lib/auth';

export const POST = apiHandler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await assertProjectOwner(id);
  const { instruction } = await req.json();

  if (!instruction) {
    throw new ApiError(400, "Missing instruction");
  }

  const project = await prisma.promptProject.findUnique({ where: { id } });
  if (!project) {
    throw new ApiError(404, "Project not found");
  }

  const fullPrompt = project.finalPrompt || '';
  const llm = getLlmClient();
  if (!llm.generateRaw) {
    throw new ApiError(500, "LLM client does not support generateRaw");
  }

  const refinePrompt = `You are an expert AI voice agent architect.
Apply the user's natural language modification instruction to the existing prompt package while STRICTLY maintaining all mandatory markdown section headers and voice telephony best practices.

INSTRUCTION: "${instruction}"

EXISTING PROMPT:
${fullPrompt}

Output ONLY the complete, updated markdown prompt package.`;

  const rawResult = await llm.generateRaw(refinePrompt);
  const updatedPrompt = rawResult.replace(/```markdown|```/g, '').trim();

  const updated = await prisma.promptProject.update({
    where: { id },
    data: {
      finalPrompt: updatedPrompt,
      version: { increment: 1 },
      versions: {
        create: {
          version: (project.version || 1) + 1,
          finalPrompt: updatedPrompt,
          businessSpec: project.businessSpec,
          blueprintJson: project.blueprintJson,
          changeSummary: `Iterated via natural language: ${instruction}`
        }
      }
    }
  });

  return NextResponse.json(updated);
});
