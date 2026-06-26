import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const versions = await prisma.promptVersion.findMany({
      where: { projectId: id },
      orderBy: { version: 'desc' }
    });
    return NextResponse.json(versions);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const curr = await prisma.promptProject.findUnique({ where: { id } });
    const nextVer = (curr?.version || 1) + 1;

    const ver = await prisma.promptVersion.create({
      data: {
        projectId: id,
        version: nextVer,
        agentPrompt: body.agentPrompt || curr?.agentPrompt || "",
        systemPrompt: body.systemPrompt || curr?.systemPrompt || "",
        blueprintJson: curr?.blueprintJson || "{}",
        changeSummary: body.changeSummary || "Manual snapshot"
      }
    });

    await prisma.promptProject.update({
      where: { id },
      data: { version: nextVer }
    });

    return NextResponse.json(ver);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
