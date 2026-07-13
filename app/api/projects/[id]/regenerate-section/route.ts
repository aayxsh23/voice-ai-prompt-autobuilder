import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getLlmClient } from '@/lib/llm/llmClient';
import { apiHandler, ApiError } from '@/lib/apiHandler';
import { assertProjectOwner } from '@/lib/auth';

export const POST = apiHandler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await assertProjectOwner(id);
  const body = await req.json();
  const { sectionHeading, instruction } = body;

  if (!sectionHeading) {
    throw new ApiError(400, "Missing sectionHeading");
  }

  const project = await prisma.promptProject.findUnique({ where: { id } });
  if (!project) {
    throw new ApiError(404, "Project not found");
  }

  const fullPrompt = project.finalPrompt || '';

  const llm = getLlmClient();
  if (!llm.generateRaw) {
    throw new ApiError(500, "LLM client does not support generateRaw");
  }
  const prompt = `You are a precision voice agent editor.
An existing prompt package needs ONLY the section titled "### ${sectionHeading}" updated based on the instruction: "${instruction || 'Regenerate for clarity and completeness'}".

EXISTING FULL PROMPT:
${fullPrompt}

Return ONLY the updated content for the "### ${sectionHeading}" section (including the heading itself). Do not return any other sections.`;

  const rawSection = await llm.generateRaw(prompt);
  const cleanSection = rawSection.replace(/```markdown|```/g, '').trim();

  // Replace the existing section in the full prompt
  const sectionStart = fullPrompt.indexOf(`### ${sectionHeading}`);
  let updatedPrompt = fullPrompt;
  if (sectionStart !== -1) {
    const nextSectionIdx = fullPrompt.indexOf("\n### ", sectionStart + 4);
    if (nextSectionIdx !== -1) {
      updatedPrompt = fullPrompt.substring(0, sectionStart) + cleanSection + fullPrompt.substring(nextSectionIdx);
    } else {
      updatedPrompt = fullPrompt.substring(0, sectionStart) + cleanSection;
    }
  } else {
    updatedPrompt = fullPrompt + "\n\n" + cleanSection;
  }

  const updated = await prisma.promptProject.update({
    where: { id },
    data: {
      finalPrompt: updatedPrompt,
      version: { increment: 1 },
      versions: {
        create: {
          version: (project.version || 1) + 1,
          finalPrompt: updatedPrompt,
          businessSpec: project.businessSpec,
          blueprintJson: project.blueprintJson,
          changeSummary: `Regenerated section ### ${sectionHeading}: ${instruction || ''}`
        }
      }
    }
  });

  return NextResponse.json(updated);
});
