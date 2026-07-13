import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { apiHandler } from '@/lib/apiHandler';
import { assertProjectOwner } from '@/lib/auth';

export const POST = apiHandler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await assertProjectOwner(id);
  const project = await prisma.promptProject.update({
    where: { id },
    data: { status: 'published' }
  });
  return NextResponse.json(project);
});
