import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const vars = await prisma.dynamicVariable.findMany({ where: { projectId: id } });
    return NextResponse.json(vars);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const created = await prisma.dynamicVariable.create({
      data: {
        projectId: id,
        key: body.key,
        label: body.label || body.key,
        type: body.type || "business",
        required: body.required !== false,
        defaultValue: body.defaultValue || "",
        source: body.source || "static",
        description: body.description || ""
      }
    });
    return NextResponse.json(created);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
