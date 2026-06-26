import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const project = await prisma.promptProject.findUnique({
      where: { id },
      include: {
        variables: true,
        functions: true,
        knowledgeNotes: true,
        versions: { orderBy: { version: 'desc' } },
        testScenarios: true,
        qualityIssues: true,
      }
    });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json(project);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    
    // Auto increment version if agentPrompt or systemPrompt meaningfully changed
    const curr = await prisma.promptProject.findUnique({ where: { id } });
    let newVersion = curr?.version || 1;
    if (body.agentPrompt && body.agentPrompt !== curr?.agentPrompt) {
      newVersion += 1;
      await prisma.promptVersion.create({
        data: {
          projectId: id,
          version: newVersion,
          agentPrompt: body.agentPrompt,
          systemPrompt: body.systemPrompt || curr?.systemPrompt || "",
          blueprintJson: curr?.blueprintJson || "{}",
          changeSummary: "Manual editor update"
        }
      }).catch(() => {});
    }

    const updated = await prisma.promptProject.update({
      where: { id },
      data: {
        ...body,
        version: newVersion
      }
    });
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.promptProject.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
