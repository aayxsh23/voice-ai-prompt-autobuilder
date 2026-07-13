import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { apiHandler } from '@/lib/apiHandler';
import { assertProjectOwner } from '@/lib/auth';

export const GET = apiHandler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await assertProjectOwner(id);
  const vars = await prisma.dynamicVariable.findMany({ where: { projectId: id } });
  return NextResponse.json(vars);
});

export const POST = apiHandler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await assertProjectOwner(id);
  const body = await req.json();
  const created = await prisma.dynamicVariable.create({
    data: {
      projectId: id,
      key: body.key,
      label: body.label || body.key,
      type: body.type || "business",
      fieldDirection: body.fieldDirection || "infield",
      required: body.required !== false,
      defaultValue: body.defaultValue || "",
      source: body.source || "static",
      description: body.description || ""
    }
  });
  return NextResponse.json(created);
});
