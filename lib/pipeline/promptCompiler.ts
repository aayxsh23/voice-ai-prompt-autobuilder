import { getLlmClient } from '../llm/llmClient';
import { BlueprintJson, PromptPackageDraft } from '../llm/types';

export async function compilePromptPackage(input: BlueprintJson): Promise<PromptPackageDraft> {
  const llm = getLlmClient();
  return llm.generateReviewDraft(input);
}
