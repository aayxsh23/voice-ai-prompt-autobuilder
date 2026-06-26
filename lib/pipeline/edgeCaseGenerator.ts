import { getLlmClient } from '../llm/llmClient';
import { BlueprintJson } from '../llm/types';

export async function generateEdgeCases(input: BlueprintJson) {
  const llm = getLlmClient();
  return llm.generateEdgeCaseRules(input);
}
