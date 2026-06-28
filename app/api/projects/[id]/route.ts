import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
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
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json(project);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    
    const curr = await prisma.promptProject.findUnique({ where: { id } });
    
    // System Prompt Auto-Sync Check
    let systemPromptToSave = body.systemPrompt !== undefined ? body.systemPrompt : (curr?.systemPrompt || "");
    if (body.agentPrompt && body.agentPrompt !== curr?.agentPrompt) {
      if (!systemPromptToSave.includes("### end_call")) {
        systemPromptToSave += `\n\n### end_call\nEnd the voice call after the closing agent's one-shot terminal closing turn. Call this in the SAME turn as the closing phrase; no further turns will be processed.\nParameters:\n- \`reason\` (string, optional): Optional short reason such as goodbye, wrong_number, refusal, voicemail, or verification_complete.`;
      }
      if (!systemPromptToSave.includes("### validate_digit_input")) {
        systemPromptToSave += `\n\n### validate_digit_input\nValidate phone number or pin-code digits from a spoken user turn, including partial input and repeated STT fragments.\nParameters:\n- \`field\` (string, required): Human-readable field name: whatsapp, pin, or mobile_number.\n- \`expected_digits\` (integer, required): Required digit count, typically 10 for phone numbers or 6 for pin codes.\n- \`user_text\` (string, required): Latest customer utterance.\n- \`previously_collected\` (string, optional): ALL digits collected so far in previous turns for this field. CRITICAL: If the user provided digits in recent turns but you did not call this tool, YOU MUST extract and include them here to prevent data loss.`;
      }
      body.systemPrompt = systemPromptToSave;
    }

    // Auto increment version if agentPrompt or systemPrompt meaningfully changed
    let newVersion = curr?.version || 1;
    if (body.agentPrompt && body.agentPrompt !== curr?.agentPrompt) {
      newVersion += 1;
      await prisma.promptVersion.create({
        data: {
          projectId: id,
          version: newVersion,
          agentPrompt: body.agentPrompt,
          systemPrompt: systemPromptToSave,
          blueprintJson: curr?.blueprintJson || "{}",
          changeSummary: "Manual editor update with auto-synced system prompt"
        }
      }).catch(() => {});
    }

    const updated = await prisma.promptProject.update({
      where: { id },
      data: {
        ...body,
        version: newVersion
      }
    });
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.promptProject.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
