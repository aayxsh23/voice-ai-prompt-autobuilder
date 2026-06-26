import { getLlmClient } from '../llm/llmClient';
import { QualityReview } from '../llm/types';

export async function evaluatePrompt(agentPrompt: string, systemPrompt: string, useCase: string): Promise<QualityReview> {
  const llm = getLlmClient();
  return llm.evaluatePromptQuality(agentPrompt, systemPrompt, useCase);
}
