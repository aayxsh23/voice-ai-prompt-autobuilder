import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { apiHandler, ApiError } from '@/lib/apiHandler';
import { assertProjectOwner } from '@/lib/auth';

const EDITABLE = new Set<string>([
  'name', 'category', 'description', 'purposeInPrompt', 'requiredInputsJson', 'expectedOutputsJson', 'enabled',
]);
const PROTECTED_TOOLS = ["validate_digit_input", "set_capture_mode", "end_call", "format_email_for_voice", "format_email_for_voice_no_comma"];

export const PATCH = apiHandler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (id.startsWith("preset_")) {
    throw new ApiError(400, "System runtime presets cannot be modified.");
  }
  const existing = await prisma.suggestedFunction.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Function not found");
  await assertProjectOwner(existing.projectId);
  if (PROTECTED_TOOLS.includes(existing.name)) {
    throw new ApiError(400, "Protected system runtime tools cannot be modified.");
  }
  const body = await req.json();
  const data: Record<string, unknown> = {};
  for (const k of Object.keys(body)) if (EDITABLE.has(k)) data[k] = body[k];
  const updated = await prisma.suggestedFunction.update({ where: { id }, data });
  return NextResponse.json(updated);
});

export const DELETE = apiHandler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (id.startsWith("preset_")) {
    return NextResponse.json({ success: true });
  }
  const existing = await prisma.suggestedFunction.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Function not found");
  await assertProjectOwner(existing.projectId);
  if (PROTECTED_TOOLS.includes(existing.name)) {
    throw new ApiError(400, "Protected system runtime tools cannot be deleted.");
  }
  await prisma.suggestedFunction.delete({ where: { id } });
  return NextResponse.json({ success: true });
});
