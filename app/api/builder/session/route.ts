import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({
        data: { id: 'default-user-id', name: 'Alex Rivera', email: 'alex@example.com' }
      });
    }

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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
