import { getLlmClient } from '../llm/llmClient';
import { PromptPackageDraft, QualityReview } from '../llm/types';

export async function improvePrompt(draft: PromptPackageDraft, critique: QualityReview): Promise<PromptPackageDraft> {
  const llm = getLlmClient();
  return llm.improvePromptWithCritique(draft, critique);
}
