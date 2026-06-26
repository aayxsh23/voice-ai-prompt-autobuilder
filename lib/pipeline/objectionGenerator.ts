import { getLlmClient } from '../llm/llmClient';
import { BlueprintJson } from '../llm/types';

export async function generateObjections(input: BlueprintJson) {
  const llm = getLlmClient();
  return llm.generateObjectionCards(input);
}
