import { getLlmClient } from '../llm/llmClient';
import { WorkflowState, MultiAgentManifest } from '../llm/types/MetaAgentSchemas';

export async function generateLeadBuilderManifest(state: WorkflowState): Promise<MultiAgentManifest> {
  const llm = getLlmClient();
  
  const systemPrompt = `
You are a Lead AI Architect. Your job is to design a Multi-Agent Voice AI system.
You must output a structured JSON object containing exactly 5 sub-agents: router, opener, pitch, collector, closer.

CRITICAL RULES:
1. DO NOT duplicate guardrails. Distribute safety, PII, and sales rules only to the relevant agents.
2. Integrate all operational protocols into the specific FSM state 'notes'. Do not create a global protocol section.
3. Define exact JSON schemas for tools required by the collector and closer.
  `;

  let userPrompt = \`Business Specification:\n\${JSON.stringify(state.spec)}\n\`;
  if (state.judgeFeedback && state.judgeFeedback.length > 0) {
    userPrompt += \`\nFIX PREVIOUS ERRORS:\n\${JSON.stringify(state.judgeFeedback)}\`;
  }

  // Uses JSON schema enforcement matching MultiAgentManifest
  const rawResponse = await (llm.generateRaw as any)(userPrompt, 0.2, { 
    systemInstruction: systemPrompt,
    json: true 
  });
  
  return JSON.parse(rawResponse) as MultiAgentManifest;
}
