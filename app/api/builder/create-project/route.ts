import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { apiHandler } from '@/lib/apiHandler';
import { getCurrentUser } from '@/lib/auth';

export const POST = apiHandler(async (req: Request) => {
    const body = await req.json();
    const { sessionId, draft, blueprint } = body;

    const user = await getCurrentUser();

    const bizName = blueprint?.business?.businessName || "New Prompt Project";
    // The compiled spec is authoritative for the agent's name; the legacy
    // phrasesToUse lookup only applies to blueprints from the older chat builder.
    const agentName =
      draft?.businessSpec?.meta?.agentName ||
      blueprint?.business?.agentName ||
      blueprint?.personality?.phrasesToUse?.[0] ||
      "Sarah";
    const useCase = blueprint?.useCase || "Custom Voice Agent Prompt";
    const industry = blueprint?.business?.industry || "Cross-Industry";

    const project = await prisma.promptProject.create({
      data: {
        userId: user.id,
        name: `${bizName} - Prompt Package`,
        agentName,
        useCase,
        industry,
        status: 'draft',
        languageMode: blueprint?.languageMode || blueprint?.business?.languageMode || blueprint?.businessSpec?.meta?.languageMode || "english",
        welcomeMessage: blueprint?.conversation?.opening || `Hello, thanks for calling ${bizName}.`,
        finalPrompt: draft?.finalPrompt || "",
        businessSpec: typeof draft?.businessSpec === 'object' ? JSON.stringify(draft.businessSpec) : (draft?.businessSpec || "{}"),
        blueprintJson: JSON.stringify(blueprint || {}),
        qualityScore: draft?.qualityReview?.overallScore ?? 0,
        completionScore: draft?.qualityReview?.completionScore ?? 0,
        safetyScore: draft?.qualityReview?.safetyScore ?? 0,
        voiceStyleScore: draft?.qualityReview?.voiceStyleScore ?? 0,
        structureScore: draft?.qualityReview?.structureScore ?? 0,
        edgeCaseScore: draft?.qualityReview?.edgeCaseScore ?? 0,
        humanQualityScore: draft?.qualityReview?.humanQualityScore ?? 0,
        hallucinationResistanceScore: draft?.qualityReview?.hallucinationResistanceScore ?? 0,
        minimumManualEditScore: draft?.qualityReview?.minimumManualEditScore ?? 0,
        version: 1,
        variables: {
          create: (draft?.dynamicVariables || []).map((v: Record<string, unknown>) => ({
            key: v.key,
            label: v.label || v.key,
            type: v.type || "business",
            fieldDirection: v.fieldDirection || "infield",
            required: v.required !== false,
            defaultValue: v.defaultValue || "",
            source: v.source || "static",
            description: v.description || ""
          }))
        },
        functions: {
          create: (draft?.suggestedFunctions || []).map((f: Record<string, unknown>) => ({
            name: f.name,
            category: f.category || "Tool",
            description: f.description || "",
            purposeInPrompt: f.purposeInPrompt || "",
            requiredInputsJson: JSON.stringify(f.requiredInputs || []),
            expectedOutputsJson: JSON.stringify(f.expectedOutputs || []),
            parametersJson: JSON.stringify(f.parameters || {}),
            enabled: f.enabled !== false
          }))
        },
        knowledgeNotes: {
          create: (draft?.knowledgeBaseSuggestions || []).map((k: Record<string, unknown>) => ({
            title: k.title,
            content: k.content,
            category: k.category || "General"
          }))
        },
        testScenarios: {
          create: (draft?.testScenarios || []).map((s: Record<string, unknown>) => ({
            title: s.title,
            persona: s.persona || "easy caller",
            callerGoal: s.callerGoal || "",
            sampleCallerMessage: s.sampleCallerMessage || "",
            expectedAgentBehavior: s.expectedAgentBehavior || "",
            riskLevel: s.riskLevel || "low"
          }))
        },
        versions: {
          create: [
            {
              version: 1,
              finalPrompt: draft?.finalPrompt || "",
              businessSpec: typeof draft?.businessSpec === 'object' ? JSON.stringify(draft.businessSpec) : (draft?.businessSpec || "{}"),
              blueprintJson: JSON.stringify(blueprint || {}),
              changeSummary: "Initial project creation from builder wizard"
            }
          ]
        }
      }
    });

    if (sessionId) {
      await prisma.builderSession.update({
        where: { id: sessionId },
        data: { generatedProjectId: project.id }
      }).catch((e) => console.warn('[create-project] failed to link session to project:', e));
    }

    return NextResponse.json(project);
});
