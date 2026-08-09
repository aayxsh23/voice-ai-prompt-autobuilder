import { ValidationResult } from "./types";
import { BusinessSpecification, CallFlowStep } from "@/lib/llm/types";

export function validateFlowCompleteness(
  spec: Partial<BusinessSpecification>,
  steps: CallFlowStep[] = []
): ValidationResult {
  const errors: string[] = [];

  const flowSteps = steps.length > 0 ? steps : (spec.callFlowPlan?.steps || []);
  const fsmStates = spec.callFlowPlan?.fsmStates || [];
  
  // Use FSM states if they exist (WorkflowArchitect path), otherwise fall back to legacy steps
  const activeNodes = (fsmStates.length > 0 ? fsmStates : flowSteps) as any[];

  if (!activeNodes || activeNodes.length === 0) {
    return {
      isValid: false,
      errors: ["No call flow steps defined in state machine specification."]
    };
  }

  const stepIds = new Set<string>();
  const stepOrders = new Set<number>();
  const referencedTargets = new Set<string | number>();

  activeNodes.forEach((node, index) => {
    const id = node.id || node.stateId || node.label || (node.stepNumber ? `step_${node.stepNumber}` : `step_${index + 1}`);
    const order = node.sequenceOrder || node.stepNumber || index + 1;
    const name = node.objective || node.stateName || node.label || id;
    const slots = Array.isArray(node.slotsToCollect) ? node.slotsToCollect : (node.collectsVariable ? [node.collectsVariable] : []);

    stepIds.add(id);
    stepOrders.add(order);

    // 1. Check fallback & retries on non-terminal capture steps
    // For FSM states, look at retryPolicy and subLoop
    if (!node.isTerminal && !node.terminal && slots.length > 0) {
      const hasFallback = node.fallbackBehavior || node.onFailure?.fallbackLine || node.subLoop || node.retryPolicy;
      if (!hasFallback) {
        errors.push(`Step '${id}' (${name}) collects slots [${slots.join(', ')}] but lacks fallbackBehavior for speech/NLU failure.`);
      }
      
      const hasMaxRetries = typeof node.maxRetries === 'number' || typeof node.onFailure?.afterRetries === 'number' || typeof node.retryPolicy?.maxAttempts === 'number' || typeof node.maxTurns === 'number';
      if (!hasMaxRetries) {
        errors.push(`Step '${id}' (${name}) must specify maxRetries or onFailure limit to prevent infinite loops.`);
      }
    }

    // 2. Track branching destinations (Legacy branchingConditions or FSM edges)
    if (Array.isArray(node.branchingConditions)) {
      node.branchingConditions.forEach((branch: any) => {
        if (branch.goToStep && branch.goToStep !== "end_call" && branch.goToStep !== "transfer") {
          referencedTargets.add(branch.goToStep);
        }
      });
    } else if (Array.isArray(node.edges)) {
      node.edges.forEach((edge: any) => {
        if (edge.targetStateId && edge.targetStateId !== "end_call" && edge.targetStateId !== "transfer") {
           referencedTargets.add(edge.targetStateId);
        }
      });
    }

    // 3. Track onFailure/retry destinations
    if (node.onFailure?.target && node.onFailure.target !== "end_call" && node.onFailure.target !== "transfer") {
      const action = node.onFailure.action?.toLowerCase() || "";
      if (action !== "transfer" && action !== "hangup" && action !== "end_call") {
        referencedTargets.add(node.onFailure.target);
      }
    } else if (node.retryPolicy?.onExhausted?.targetStateId && node.retryPolicy.onExhausted.targetStateId !== "end_call") {
       referencedTargets.add(node.retryPolicy.onExhausted.targetStateId);
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
  const hasTerminalStep = activeNodes.some((node: any) => {
    if (node.isTerminal || node.terminal || node.id === 'end_call' || node.stateId === 'end_call') return true;
    if (Array.isArray(node.invokesTools) && node.invokesTools.some((t: any) => t === "end_call" || t === "transfer_call")) return true;
    if (node.entryAction?.tool === "end_call" || node.entryAction?.tool === "transfer_call") return true;
    if (Array.isArray(node.branchingConditions) && node.branchingConditions.some((b: any) => b.goToStep === "end_call" || b.goToStep === "transfer" || b.action === "end_call" || b.action === "transfer")) return true;
    if (Array.isArray(node.edges) && node.edges.some((e: any) => e.targetStateId === "end_call" || e.targetStateId === "transfer" || e.action === "end_call" || e.action === "transfer" || e.closeVariant)) return true;
    return false;
  });

  if (!hasTerminalStep) {
    errors.push("Call flow state machine lacks a terminal closing step or transition to end_call/transfer.");
  }

  // 6. Verify confirmation step exists when collecting multiple slots
  const allCollectedSlots = activeNodes.flatMap((s: any) => Array.isArray(s.slotsToCollect) ? s.slotsToCollect : (s.collectsVariable ? [s.collectsVariable] : [])).filter(Boolean);
  if (allCollectedSlots.length >= 2) {
    const hasConfirmation = activeNodes.some((s: any) =>
      (s.stateId || s.id || s.label || '').toLowerCase().includes("confirm") ||
      (s.stateId || s.id || s.label || '').toLowerCase().includes("readback") ||
      (s.stateName || s.objective || s.label || '').toLowerCase().includes("confirm") ||
      (s.stateName || s.objective || s.label || '').toLowerCase().includes("read back") ||
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
