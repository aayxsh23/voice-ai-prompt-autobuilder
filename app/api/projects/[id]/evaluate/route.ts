import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getLlmClient } from '@/lib/llm/llmClient';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const project = await prisma.promptProject.findUnique({ where: { id } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const llm = getLlmClient();
    const review = await llm.evaluatePromptQuality(project.agentPrompt, project.systemPrompt, project.useCase);

    // Update project scores
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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
