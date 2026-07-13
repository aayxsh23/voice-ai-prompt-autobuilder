import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getLlmClient } from '@/lib/llm/llmClient';
import { apiHandler } from '@/lib/apiHandler';
import { assertProjectOwner } from '@/lib/auth';

export const POST = apiHandler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await assertProjectOwner(id);
  const project = await prisma.promptProject.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const llm = getLlmClient();
  const review = await llm.evaluatePromptQuality(project.finalPrompt, project.finalPrompt, project.useCase);

  const updated = await prisma.promptProject.update({
    where: { id },
    data: {
      qualityScore: review.overallScore,
      completionScore: review.completionScore,
      safetyScore: review.safetyScore,
      voiceStyleScore: review.voiceStyleScore,
      structureScore: review.structureScore,
      edgeCaseScore: review.edgeCaseScore,
      humanQualityScore: review.humanQualityScore,
      hallucinationResistanceScore: review.hallucinationResistanceScore,
      minimumManualEditScore: review.minimumManualEditScore,
    }
  });

  return NextResponse.json({ project: updated, review });
});
