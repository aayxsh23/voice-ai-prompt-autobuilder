import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { apiHandler, ApiError } from '@/lib/apiHandler';
import { getCurrentUser, assertProjectOwner } from '@/lib/auth';

// Scalar fields a client is allowed to update. Prevents mass-assignment of
// tenancy/identity fields (userId, id) or route-managed fields (version, timestamps).
const EDITABLE_FIELDS = new Set<string>([
  'name', 'agentName', 'useCase', 'industry', 'status', 'welcomeMessage',
  'finalPrompt', 'businessSpec', 'blueprintJson', 'languageMode',
  'qualityScore', 'completionScore', 'safetyScore', 'voiceStyleScore', 'structureScore',
  'edgeCaseScore', 'humanQualityScore', 'hallucinationResistanceScore', 'minimumManualEditScore',
]);

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
  const user = await getCurrentUser();
  const project = await prisma.promptProject.findUnique({
    where: { id },
    include: {
      variables: true,
      functions: true,
      knowledgeNotes: true,
      versions: { orderBy: { version: 'desc' } },
      testScenarios: true,
      qualityIssues: true,
    }
  });
  if (!project) throw new ApiError(404, 'Project not found');
  if (project.userId !== user.id) throw new ApiError(403, 'Forbidden');

  const presets = getSystemPresetFunctions(id);
  const combinedFunctions = [
    ...presets,
    ...(project.functions || []).filter(f => !presets.some(p => p.name === f.name))
  ];
  return NextResponse.json({ ...project, functions: combinedFunctions });
});

export const PATCH = apiHandler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await assertProjectOwner(id);
  const body = await req.json();

  const curr = await prisma.promptProject.findUnique({ where: { id } });

  // System Prompt Auto-Sync Check
  let finalPromptToSave = body.finalPrompt !== undefined ? body.finalPrompt : (curr?.finalPrompt || "");
  if (body.finalPrompt && body.finalPrompt !== curr?.finalPrompt) {
    if (!finalPromptToSave.includes("### TELEPHONY RUNTIME TOOLS") && !finalPromptToSave.includes("### end_call")) {
      finalPromptToSave += `\n\n### end_call\nEnd the voice call after the closing agent's one-shot terminal closing turn. Call this in the SAME turn as the closing phrase; no further turns will be processed.\nParameters:\n- \`reason\` (string, optional): Optional short reason such as goodbye, wrong_number, refusal, voicemail, or verification_complete.`;
    }
    if (!finalPromptToSave.includes("### TELEPHONY RUNTIME TOOLS") && !finalPromptToSave.includes("### validate_digit_input")) {
      finalPromptToSave += `\n\n### validate_digit_input\nValidate phone number or pin-code digits from a spoken user turn, including partial input and repeated STT fragments.\nParameters:\n- \`field\` (string, required): Human-readable field name: whatsapp, pin, or mobile_number.\n- \`expected_digits\` (integer, required): Required digit count, typically 10 for phone numbers or 6 for pin codes.\n- \`user_text\` (string, required): Latest customer utterance.\n- \`previously_collected\` (string, optional): ALL digits collected so far in previous turns for this field. CRITICAL: If the user provided digits in recent turns but you did not call this tool, YOU MUST extract and include them here to prevent data loss.`;
    }
    body.finalPrompt = finalPromptToSave;
  }

  // Build the update payload from allow-listed fields only.
  const data: Record<string, unknown> = {};
  for (const key of Object.keys(body)) {
    if (EDITABLE_FIELDS.has(key)) data[key] = body[key];
  }

  // Auto increment version if finalPrompt meaningfully changed
  let newVersion = curr?.version || 1;
  if (body.finalPrompt && body.finalPrompt !== curr?.finalPrompt) {
    newVersion += 1;
    await prisma.promptVersion.create({
      data: {
        projectId: id,
        version: newVersion,
        finalPrompt: body.finalPrompt,
        businessSpec: curr?.businessSpec || "{}",
        blueprintJson: curr?.blueprintJson || "{}",
        changeSummary: "Manual editor update with auto-synced prompt"
      }
    }).catch((e) => console.warn('[projects PATCH] version snapshot failed:', e));
  }
  data.version = newVersion;

  const updated = await prisma.promptProject.update({ where: { id }, data });
  return NextResponse.json(updated);
});

export const DELETE = apiHandler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await assertProjectOwner(id);
  await prisma.promptProject.delete({ where: { id } });
  return NextResponse.json({ success: true });
});
