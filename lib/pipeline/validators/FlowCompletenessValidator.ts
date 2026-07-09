import { ValidationResult } from "./types";
import { BusinessSpecification, CallFlowStep } from "@/lib/llm/types";

export function validateFlowCompleteness(
  spec: Partial<BusinessSpecification>,
  steps: CallFlowStep[] = []
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const flowSteps = steps.length > 0 ? steps : (spec.callFlowPlan?.steps || []);

  if (!flowSteps || flowSteps.length === 0) {
    return {
      isValid: false,
      errors: ["No call flow steps defined in state machine specification."]
    };
  }

  const stepIds = new Set<string>();
  const stepOrders = new Set<number>();
  const referencedTargets = new Set<string | number>();

  flowSteps.forEach((stepItem, index) => {
    const step = stepItem as any;
    const id = step.stateId || step.label || (step.stepNumber ? `step_${step.stepNumber}` : `step_${index + 1}`);
    const order = step.sequenceOrder || step.stepNumber || index + 1;
    const name = step.stateName || step.label || id;
    const slots = Array.isArray(step.slotsToCollect) ? step.slotsToCollect : (step.collectsVariable ? [step.collectsVariable] : []);

    stepIds.add(id);
    stepOrders.add(order);

    // 1. Check fallback & retries on non-terminal capture steps
    if (!step.isTerminal && slots.length > 0) {
      if (!step.fallbackBehavior && !step.onFailure?.fallbackLine) {
        errors.push(`Step '${id}' (${name}) collects slots [${slots.join(', ')}] but lacks fallbackBehavior for speech/NLU failure.`);
      }
      if (!step.maxRetries && !step.onFailure?.afterRetries) {
        errors.push(`Step '${id}' (${name}) must specify maxRetries or onFailure limit to prevent infinite loops.`);
      }
    }

    // 2. Track branching destinations
    if (Array.isArray(step.branchingConditions)) {
      step.branchingConditions.forEach((branch: any) => {
        if (branch.goToStep && branch.goToStep !== "end_call" && branch.goToStep !== "transfer") {
          referencedTargets.add(branch.goToStep);
        }
      });
    }

    // 3. Track onFailure destinations
    if (step.onFailure?.target && step.onFailure.target !== "end_call" && step.onFailure.target !== "transfer") {
      const action = step.onFailure.action?.toLowerCase() || "";
      if (action !== "transfer" && action !== "hangup" && action !== "end_call") {
        referencedTargets.add(step.onFailure.target);
      }
    }
  });

  // 4. Verify all referenced target IDs/orders actually exist
  referencedTargets.forEach((target: any) => {
    if (typeof target === "number") {
      if (!stepOrders.has(target)) {
        errors.push(`Branch condition references non-existent sequenceOrder: ${target}`);
      }
    } else if (typeof target === "string") {
      // Check if string matches a stateId or stringified sequenceOrder
      if (!stepIds.has(target) && !stepOrders.has(Number(target))) {
        errors.push(`Branch condition references non-existent stateId or sequenceOrder: '${target}'`);
      }
    }
  });

  // 5. Verify at least one terminal step exists (end_call / transfer / isTerminal flag)
  const hasTerminalStep = flowSteps.some((step: any) => {
    if (step.isTerminal) return true;
    if (Array.isArray(step.invokesTools) && step.invokesTools.some((t: any) => t === "end_call" || t === "transfer_call")) return true;
    if (Array.isArray(step.branchingConditions) && step.branchingConditions.some((b: any) => b.goToStep === "end_call" || b.goToStep === "transfer" || b.action === "end_call" || b.action === "transfer")) return true;
    return false;
  });

  if (!hasTerminalStep) {
    errors.push("Call flow state machine lacks a terminal closing step or transition to end_call/transfer.");
  }

  // 6. Verify confirmation step exists when collecting multiple slots
  const allCollectedSlots = flowSteps.flatMap((s: any) => Array.isArray(s.slotsToCollect) ? s.slotsToCollect : (s.collectsVariable ? [s.collectsVariable] : [])).filter(Boolean);
  if (allCollectedSlots.length >= 2) {
    const hasConfirmation = flowSteps.some((s: any) =>
      (s.stateId || s.label || '').toLowerCase().includes("confirm") ||
      (s.stateName || s.label || '').toLowerCase().includes("confirm") ||
      s.confirmationRequired === true
    );
    if (!hasConfirmation) {
      errors.push(`Flow collects ${allCollectedSlots.length} slots (${allCollectedSlots.join(', ')}) but lacks a confirmation read-back step prior to resolution.`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
