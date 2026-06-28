import { VoiceAgentIR } from "../ir/IntermediateRepresentation";
import { PromptPackageDraft } from "@/lib/llm/types";
import { CallFlowStep, TransferCondition } from "@/lib/llm/types";

function renderStep(step: CallFlowStep, verbatimLines: Array<{ stepLabel: string; exactLine: string }> = []): string {
  const override = verbatimLines.find(v => v.stepLabel.toLowerCase().trim() === step.label.toLowerCase().trim());
  const dialogueLine = override ? override.exactLine : step.generatedLine;
  return [
    `STEP ${step.stepNumber}: ${step.label}`,
    `Condition: ${step.condition}`,
    `Say: "${dialogueLine}"`,
    step.branchingConditions.map((b: any) => `Branch: If ${b.condition} → ${b.goToStep}`).join('\n'),
    `Fallback: ${step.fallbackBehavior}`
  ].join('\n');
}

function formatPhoneForTTS(e164: string): string {
  const clean = e164.replace(/[^\d]/g, '');
  const digitWords: Record<string, string> = {
    '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four',
    '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine'
  };
  let digits = clean;
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.substring(1);
  if (digits.length !== 10) return digits.split('').map(d => digitWords[d] || d).join(' ');
  const g1 = digits.slice(0, 3).split('').map(d => digitWords[d]).join(' ');
  const g2 = digits.slice(3, 6).split('').map(d => digitWords[d]).join(' ');
  const g3 = digits.slice(6, 10).split('').map(d => digitWords[d]).join(' ');
  return `${g1}, ${g2}, ${g3}`;
}

function buildHumanTransferSection(conditions: TransferCondition[]): string {
  if (!conditions || conditions.length === 0) return "";
  const lines = ["### HUMAN TRANSFER RULES\n"];
  for (const cond of conditions) {
    const formattedPhone = formatPhoneForTTS(cond.transferPhoneNumber);
    const thresholdStr = cond.threshold ? ` (after ${cond.threshold} occurrences)` : "";
    const deptStr = cond.transferDepartment ? ` to ${cond.transferDepartment}` : "";
    lines.push(`Trigger: ${cond.trigger}${thresholdStr}${deptStr}`);
    lines.push(`Action: Say: "${cond.sayBeforeTransfer}" Then transfer to ${formattedPhone}.\n`);
  }
  return lines.join("\n");
}

export class StateMachineCompiler {
  compile(ir: VoiceAgentIR, draft?: Partial<PromptPackageDraft>): string {
    let callFlowSection: string;
    if (draft?.callFlowSteps && draft.callFlowSteps.length > 0) {
      const renderedSteps = draft.callFlowSteps.map((step: CallFlowStep) =>
        renderStep(step, draft.verbatimLines ?? [])
      );
      callFlowSection = `### CALL FLOW\n\n${renderedSteps.join('\n\n')}\n`;
    } else {
      callFlowSection = `### CALL FLOW\n\n(Legacy IR Flow)\n`;
    }
    const transferSection = buildHumanTransferSection(draft?.transferConditions ?? []);
    return `${callFlowSection}\n${transferSection}`.trim();
  }
}
