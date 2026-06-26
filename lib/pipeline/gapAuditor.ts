import { getLlmClient } from '../llm/llmClient';
import { BusinessSnapshot, CallMission, ConversationDesign, GapAuditResult, VoicePersonality } from '../llm/types';

export async function auditBlueprintGaps(input: {
  business: BusinessSnapshot;
  mission: CallMission;
  conversation: ConversationDesign;
  personality: VoicePersonality;
}): Promise<GapAuditResult> {
  const llm = getLlmClient();
  const res = await llm.runGapAudit(input);
  // Ensure no more than 7 follow-up questions per specs
  if (res && res.missingCriticalDetails) {
    res.missingCriticalDetails = res.missingCriticalDetails.slice(0, 7);
  }
  return res;
}
