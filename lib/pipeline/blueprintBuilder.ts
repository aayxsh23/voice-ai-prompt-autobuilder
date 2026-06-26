import { getLlmClient } from '../llm/llmClient';
import { BlueprintJson, BusinessSnapshot, CallMission, ConversationDesign } from '../llm/types';

export async function buildConversationDesign(input: {
  template: string;
  business: BusinessSnapshot;
  mission: CallMission;
}): Promise<ConversationDesign> {
  const llm = getLlmClient();
  return llm.generateConversationDesign(input);
}

export function compileBlueprint(input: {
  useCase: string;
  selectedTemplate: string;
  business: BusinessSnapshot;
  mission: CallMission;
  conversation: ConversationDesign;
  personality: any;
  followupAnswers: Record<string, string>;
}): BlueprintJson {
  return {
    useCase: input.useCase,
    selectedTemplate: input.selectedTemplate,
    business: input.business,
    mission: input.mission,
    conversation: input.conversation,
    personality: input.personality,
    followupAnswers: input.followupAnswers || {},
  };
}
