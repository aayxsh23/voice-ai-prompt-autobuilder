import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const projects = await prisma.promptProject.findMany({
      orderBy: { updatedAt: 'desc' }
    });
    return NextResponse.json(projects);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({
        data: { id: 'default-user-id', name: 'Alex Rivera', email: 'alex@example.com' }
      });
    }

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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
