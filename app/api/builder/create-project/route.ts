import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sessionId, draft, blueprint } = body;

    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({
        data: { id: 'default-user-id', name: 'Alex Rivera', email: 'alex@example.com' }
      });
    }

    const bizName = blueprint?.business?.businessName || "New Prompt Project";
    const agentName = blueprint?.personality?.phrasesToUse?.[0] || "Sarah";
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
        welcomeMessage: blueprint?.conversation?.opening || `Hello, thanks for calling ${bizName}.`,
        agentPrompt: draft?.agentPrompt || "",
        systemPrompt: draft?.systemPrompt || "",
        blueprintJson: JSON.stringify(blueprint || {}),
        qualityScore: draft?.qualityReview?.overallScore || 90,
        completionScore: draft?.qualityReview?.completionScore || 90,
        safetyScore: draft?.qualityReview?.safetyScore || 95,
        voiceStyleScore: draft?.qualityReview?.voiceStyleScore || 92,
        structureScore: draft?.qualityReview?.structureScore || 88,
        edgeCaseScore: draft?.qualityReview?.edgeCaseScore || 89,
        humanQualityScore: draft?.qualityReview?.humanQualityScore || 91,
        hallucinationResistanceScore: draft?.qualityReview?.hallucinationResistanceScore || 94,
        minimumManualEditScore: draft?.qualityReview?.minimumManualEditScore || 90,
        version: 1,
        variables: {
          create: (draft?.dynamicVariables || []).map((v: any) => ({
            key: v.key,
            label: v.label || v.key,
            type: v.type || "business",
            required: v.required !== false,
            defaultValue: v.defaultValue || "",
            source: v.source || "static",
            description: v.description || ""
          }))
        },
        functions: {
          create: (draft?.suggestedFunctions || []).map((f: any) => ({
            name: f.name,
            category: f.category || "Tool",
            description: f.description || "",
            purposeInPrompt: f.purposeInPrompt || "",
            requiredInputsJson: JSON.stringify(f.requiredInputs || []),
            expectedOutputsJson: JSON.stringify(f.expectedOutputs || []),
            enabled: f.enabled !== false
          }))
        },
        knowledgeNotes: {
          create: (draft?.knowledgeBaseSuggestions || []).map((k: any) => ({
            title: k.title,
            content: k.content,
            category: k.category || "General"
          }))
        },
        testScenarios: {
          create: (draft?.testScenarios || []).map((s: any) => ({
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
              agentPrompt: draft?.agentPrompt || "",
              systemPrompt: draft?.systemPrompt || "",
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
      }).catch(() => {});
    }

    return NextResponse.json(project);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
