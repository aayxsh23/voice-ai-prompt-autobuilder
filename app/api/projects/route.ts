import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { apiHandler } from '@/lib/apiHandler';
import { getCurrentUser } from '@/lib/auth';

export const GET = apiHandler(async () => {
  const user = await getCurrentUser();
  const projects = await prisma.promptProject.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
  });
  return NextResponse.json(projects);
});

export const POST = apiHandler(async (req: Request) => {
  const body = await req.json();
  const user = await getCurrentUser();

  const project = await prisma.promptProject.create({
    data: {
      userId: user.id,
      name: body.name || "Untitled Prompt Project",
      agentName: body.agentName || "Agent",
      useCase: body.useCase || "Custom Voice Agent Prompt",
      industry: body.industry || "General",
      status: "draft",
      welcomeMessage: body.welcomeMessage || "Hello!",
      finalPrompt: body.finalPrompt || "# Agent Blueprint\nYou are an AI voice agent...",
      businessSpec: typeof body.businessSpec === 'object' ? JSON.stringify(body.businessSpec) : (body.businessSpec || "{}"),
      blueprintJson: JSON.stringify(body.blueprint || {}),
      qualityScore: body.qualityScore ?? 0,
      completionScore: body.completionScore ?? 0,
      safetyScore: body.safetyScore ?? 0,
      voiceStyleScore: body.voiceStyleScore ?? 0,
      structureScore: body.structureScore ?? 0,
      edgeCaseScore: body.edgeCaseScore ?? 0,
      humanQualityScore: body.humanQualityScore ?? 0,
      hallucinationResistanceScore: body.hallucinationResistanceScore ?? 0,
      minimumManualEditScore: body.minimumManualEditScore ?? 0,
      version: 1
    }
  });
  return NextResponse.json(project);
});
