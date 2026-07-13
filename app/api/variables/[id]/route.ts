import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { apiHandler, ApiError } from '@/lib/apiHandler';
import { assertProjectOwner } from '@/lib/auth';

const EDITABLE = new Set<string>([
  'key', 'label', 'type', 'fieldDirection', 'required', 'defaultValue', 'source', 'description',
]);

async function assertOwnedVariable(id: string): Promise<void> {
  const v = await prisma.dynamicVariable.findUnique({ where: { id }, select: { projectId: true } });
  if (!v) throw new ApiError(404, 'Variable not found');
  await assertProjectOwner(v.projectId);
}

export const PATCH = apiHandler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await assertOwnedVariable(id);
  const body = await req.json();
  const data: Record<string, unknown> = {};
  for (const k of Object.keys(body)) if (EDITABLE.has(k)) data[k] = body[k];
  const updated = await prisma.dynamicVariable.update({ where: { id }, data });
  return NextResponse.json(updated);
});

export const DELETE = apiHandler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await assertOwnedVariable(id);
  await prisma.dynamicVariable.delete({ where: { id } });
  return NextResponse.json({ success: true });
});
