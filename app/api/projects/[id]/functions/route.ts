import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const fns = await prisma.suggestedFunction.findMany({ where: { projectId: id } });
    return NextResponse.json(fns);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const created = await prisma.suggestedFunction.create({
      data: {
        projectId: id,
        name: body.name,
        category: body.category || "Tool",
        description: body.description || "",
        purposeInPrompt: body.purposeInPrompt || "",
        requiredInputsJson: typeof body.requiredInputs === 'string' ? body.requiredInputs : JSON.stringify(body.requiredInputs || []),
        expectedOutputsJson: typeof body.expectedOutputs === 'string' ? body.expectedOutputs : JSON.stringify(body.expectedOutputs || []),
        enabled: body.enabled !== false
      }
    });
    return NextResponse.json(created);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
