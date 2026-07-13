import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { apiHandler } from '@/lib/apiHandler';
import { assertProjectOwner } from '@/lib/auth';

export const GET = apiHandler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await assertProjectOwner(id);
  const notes = await prisma.knowledgeBaseNote.findMany({ where: { projectId: id } });
  return NextResponse.json(notes);
});

export const POST = apiHandler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await assertProjectOwner(id);
  const body = await req.json();
  const created = await prisma.knowledgeBaseNote.create({
    data: {
      projectId: id,
      title: body.title,
      content: body.content,
      category: body.category || "General"
    }
  });
  return NextResponse.json(created);
});
