import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { apiHandler, ApiError } from '@/lib/apiHandler';
import { assertProjectOwner } from '@/lib/auth';

const EDITABLE = new Set<string>(['title', 'content', 'category']);

async function assertOwnedNote(id: string): Promise<void> {
  const n = await prisma.knowledgeBaseNote.findUnique({ where: { id }, select: { projectId: true } });
  if (!n) throw new ApiError(404, 'Note not found');
  await assertProjectOwner(n.projectId);
}

export const PATCH = apiHandler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await assertOwnedNote(id);
  const body = await req.json();
  const data: Record<string, unknown> = {};
  for (const k of Object.keys(body)) if (EDITABLE.has(k)) data[k] = body[k];
  const updated = await prisma.knowledgeBaseNote.update({ where: { id }, data });
  return NextResponse.json(updated);
});

export const DELETE = apiHandler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await assertOwnedNote(id);
  await prisma.knowledgeBaseNote.delete({ where: { id } });
  return NextResponse.json({ success: true });
});
