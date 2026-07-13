import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { apiHandler } from '@/lib/apiHandler';
import { getCurrentUser } from '@/lib/auth';

export const POST = apiHandler(async (req: Request) => {
  const body = await req.json().catch(() => ({}));
  const user = await getCurrentUser();

  const session = await prisma.builderSession.create({
    data: {
      userId: user.id,
      currentStep: body.currentStep || 1,
      selectedTemplate: body.selectedTemplate || '',
      useCase: body.useCase || '',
      industry: body.industry || '',
    }
  });

  return NextResponse.json(session);
});
