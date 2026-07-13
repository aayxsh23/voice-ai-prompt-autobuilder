import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { apiHandler, ApiError } from '@/lib/apiHandler';
import { getCurrentUser } from '@/lib/auth';

const EDITABLE = new Set<string>([
  'currentStep', 'selectedTemplate', 'useCase', 'industry',
  'businessSnapshotJson', 'missionJson', 'conversationDesignJson', 'personalityJson',
  'gapAuditJson', 'followupAnswersJson', 'refinedBlueprintJson', 'businessSpec',
  'languageMode', 'generatedProjectId',
]);

async function assertOwnedSession(id: string): Promise<void> {
  const [user, session] = await Promise.all([
    getCurrentUser(),
    prisma.builderSession.findUnique({ where: { id }, select: { userId: true } }),
  ]);
  if (!session) throw new ApiError(404, 'Session not found');
  if (session.userId !== user.id) throw new ApiError(403, 'Forbidden');
}

export const GET = apiHandler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await assertOwnedSession(id);
  const session = await prisma.builderSession.findUnique({ where: { id } });
  return NextResponse.json(session);
});

export const PATCH = apiHandler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await assertOwnedSession(id);
  const body = await req.json();
  const data: Record<string, unknown> = {};
  for (const k of Object.keys(body)) if (EDITABLE.has(k)) data[k] = body[k];
  const updated = await prisma.builderSession.update({ where: { id }, data });
  return NextResponse.json(updated);
});
