import { getLlmClient } from '../llm/llmClient';
import { BlueprintJson, DynamicVariableSpec } from '../llm/types';

export async function extractVariables(input: BlueprintJson): Promise<DynamicVariableSpec[]> {
  const llm = getLlmClient();
  return llm.extractDynamicVariables(input);
}
