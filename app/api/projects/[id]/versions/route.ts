import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { apiHandler } from '@/lib/apiHandler';
import { assertProjectOwner } from '@/lib/auth';

export const GET = apiHandler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await assertProjectOwner(id);
  const versions = await prisma.promptVersion.findMany({
    where: { projectId: id },
    orderBy: { version: 'desc' }
  });
  return NextResponse.json(versions);
});

export const POST = apiHandler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await assertProjectOwner(id);
  const body = await req.json();
  const curr = await prisma.promptProject.findUnique({ where: { id } });
  const nextVer = (curr?.version || 1) + 1;

  const ver = await prisma.promptVersion.create({
    data: {
      projectId: id,
      version: nextVer,
      finalPrompt: body.finalPrompt || curr?.finalPrompt || "",
      businessSpec: curr?.businessSpec || "{}",
      blueprintJson: curr?.blueprintJson || "{}",
      changeSummary: body.changeSummary || "Manual snapshot"
    }
  });

  await prisma.promptProject.update({ where: { id }, data: { version: nextVer } });
  return NextResponse.json(ver);
});
