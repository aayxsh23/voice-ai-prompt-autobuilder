import { getLlmClient } from '../llm/llmClient';
import { BlueprintJson, TestScenarioSpec } from '../llm/types';

export async function generateScenarios(input: BlueprintJson): Promise<TestScenarioSpec[]> {
  const llm = getLlmClient();
  return llm.generateTestScenarios(input);
}
