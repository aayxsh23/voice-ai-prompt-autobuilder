import { getLlmClient } from '../llm/llmClient';
import { BlueprintJson, SuggestedFunctionSpec } from '../llm/types';

export async function generateSuggestedFunctions(input: BlueprintJson): Promise<SuggestedFunctionSpec[]> {
  const llm = getLlmClient();
  return llm.recommendSuggestedFunctions(input);
}
