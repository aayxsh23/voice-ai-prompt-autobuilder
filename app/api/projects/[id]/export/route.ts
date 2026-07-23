import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { apiHandler } from '@/lib/apiHandler';
import { assertProjectOwner } from '@/lib/auth';
import { PlatformAdapter, TargetPlatform } from '@/lib/compiler/adapters/PlatformAdapter';
import type { PromptPackageDraft } from '@/lib/llm/types';

const PLATFORMS: TargetPlatform[] = ['custom'];

function parseJsonArray(raw: string | null | undefined): unknown[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function parseJsonObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/**
 * Export a compiled prompt formatted for a specific telephony platform.
 * GET /api/projects/[id]/export?platform=bland|retell|vapi|generic
 */
export const GET = apiHandler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await assertProjectOwner(id);

  const requested = new URL(req.url).searchParams.get('platform') as TargetPlatform | null;
  const platform: TargetPlatform = 'custom';

  const project = await prisma.promptProject.findUnique({
    where: { id },
    include: { functions: true, variables: true },
  });
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const draft = {
    finalPrompt: project.finalPrompt,
    primaryGoal: project.useCase,
    suggestedFunctions: (project.functions || []).map((f) => ({
      name: f.name,
      category: f.category,
      description: f.description,
      purposeInPrompt: f.purposeInPrompt,
      requiredInputs: parseJsonArray(f.requiredInputsJson) as string[],
      expectedOutputs: parseJsonArray(f.expectedOutputsJson) as string[],
      parameters: parseJsonObject(f.parametersJson),
      enabled: f.enabled,
    })),
    dynamicVariables: (project.variables || []).map((v) => ({
      key: v.key,
      label: v.label,
      type: v.type,
      fieldDirection: v.fieldDirection,
      required: v.required,
      defaultValue: v.defaultValue,
      source: v.source,
      description: v.description,
    })),
  } as unknown as PromptPackageDraft;

  const payload = new PlatformAdapter().formatForPlatform(draft);
  return NextResponse.json(payload);
});
