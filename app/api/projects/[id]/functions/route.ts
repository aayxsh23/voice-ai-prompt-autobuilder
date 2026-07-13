import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { apiHandler, ApiError } from '@/lib/apiHandler';
import { assertProjectOwner } from '@/lib/auth';

function getSystemPresetFunctions(projectId: string) {
  return [
    {
      id: `preset_validate_digit_input_${projectId}`,
      projectId,
      name: "validate_digit_input",
      category: "System Runtime Preset",
      description: "Validate phone number or pin-code digits from a spoken user turn, including partial input and repeated STT fragments.",
      purposeInPrompt: "Validate digits and partial inputs.",
      associatedStateId: "global_runtime"
    },
    {
      id: `preset_set_capture_mode_${projectId}`,
      projectId,
      name: "set_capture_mode",
      category: "System Runtime Preset",
      description: "Toggle whether user speech captured while the bot was speaking is kept (true) or discarded (false).",
      purposeInPrompt: "Retain audio buffer during bot digit/email questioning.",
      associatedStateId: "global_runtime"
    },
    {
      id: `preset_format_email_for_voice_${projectId}`,
      projectId,
      name: "format_email_for_voice",
      category: "System Runtime Preset",
      description: "Normalize a spoken or typed email ID and return TTS-friendly speech with pauses.",
      purposeInPrompt: "Speak email segments cleanly without manual string splitting.",
      associatedStateId: "global_runtime"
    },
    {
      id: `preset_end_call_${projectId}`,
      projectId,
      name: "end_call",
      category: "System Runtime Preset",
      description: "End the voice call after the closing agent's one-shot terminal closing turn.",
      purposeInPrompt: "Synchronous call termination in closing turn.",
      associatedStateId: "resolution"
    }
  ];
}

export const GET = apiHandler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await assertProjectOwner(id);
  const fns = await prisma.suggestedFunction.findMany({ where: { projectId: id } });
  const presets = getSystemPresetFunctions(id);
  const combined = [
    ...presets,
    ...fns.filter(f => !presets.some(p => p.name === f.name))
  ];
  return NextResponse.json(combined);
});

export const POST = apiHandler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await assertProjectOwner(id);
  const body = await req.json();
  if (["validate_digit_input", "set_capture_mode", "end_call", "format_email_for_voice", "format_email_for_voice_no_comma"].includes(body.name)) {
    throw new ApiError(400, "System runtime tools are protected presets and cannot be created as database rows.");
  }
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
});
