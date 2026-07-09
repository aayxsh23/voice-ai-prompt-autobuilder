import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (id.startsWith("preset_")) {
      return NextResponse.json({ error: "System runtime presets cannot be modified." }, { status: 400 });
    }
    const body = await req.json();
    const existing = await prisma.suggestedFunction.findUnique({ where: { id } });
    if (existing && ["validate_digit_input", "set_capture_mode", "end_call", "format_email_for_voice", "format_email_for_voice_no_comma"].includes(existing.name)) {
      return NextResponse.json({ error: "Protected system runtime tools cannot be modified." }, { status: 400 });
    }
    const updated = await prisma.suggestedFunction.update({ where: { id }, data: body });
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (id.startsWith("preset_")) {
      return NextResponse.json({ success: true });
    }
    const existing = await prisma.suggestedFunction.findUnique({ where: { id } });
    if (existing && ["validate_digit_input", "set_capture_mode", "end_call", "format_email_for_voice", "format_email_for_voice_no_comma"].includes(existing.name)) {
      return NextResponse.json({ error: "Protected system runtime tools cannot be deleted." }, { status: 400 });
    }
    await prisma.suggestedFunction.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
