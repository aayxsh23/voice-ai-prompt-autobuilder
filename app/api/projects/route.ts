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
        agentPrompt: body.agentPrompt || "# Agent Blueprint",
        systemPrompt: body.systemPrompt || "You are an AI voice agent...",
        blueprintJson: JSON.stringify(body.blueprint || {}),
        qualityScore: 85,
        completionScore: 85,
        safetyScore: 90,
        voiceStyleScore: 88,
        structureScore: 85,
        edgeCaseScore: 82,
        humanQualityScore: 86,
        hallucinationResistanceScore: 89,
        minimumManualEditScore: 85,
        version: 1
      }
    });
    return NextResponse.json(project);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
