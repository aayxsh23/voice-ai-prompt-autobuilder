import { runMetaOrchestration } from './metaOrchestrator';
import { CompileInput, PromptPackageDraft } from '../llm/types';

export async function compilePromptPackage(input: CompileInput): Promise<PromptPackageDraft> {
  // Extract business spec from input
  const spec = input.businessSpec || generateFallbackSpec(input);

  // Invoke the new Agent-building-Agents loop
  const multiAgentManifest = await runMetaOrchestration(spec);

  return {
    finalPrompt: '',
    multiAgentManifest,
    businessSpec: spec,
    validationStatus: 'success',
    validationErrors: [],
    validationWarnings: [],
  } as unknown as PromptPackageDraft;
}

function generateFallbackSpec(input: CompileInput) {
  const biz = (input.business || {}) as any;
  const mission = (input.mission || {}) as any;
  const tone = input.personality?.tone ? [input.personality.tone] : ["Professional", "Helpful"];
  return {
    meta: {
      companyName: biz.companyName || biz.businessName || "Enterprise Client",
      agentName: biz.agentName || "Voice Assistant",
      industry: biz.industry || "General",
      isRegulated: false,
      toneProfile: tone,
      primaryGoal: mission.primaryGoal || biz.description || "Assist callers",
      languageMode: input.languageMode || biz.languageMode || "english"
    },
    businessSnapshot: {
      operatingHours: biz.operatingHours || "Standard Business Hours",
      servicesOffered: biz.servicesOffered || [],
      policies: {
        cancellation: biz.policies?.cancellation || "None — not specified",
        refunds: biz.policies?.refunds || "None — not specified",
        escalationNumbers: biz.policies?.escalationNumbers || []
      }
    },
    callFlowPlan: { steps: [] },
    knowledgeBase: { faqs: [], objections: [] },
    tools: []
  };
}
