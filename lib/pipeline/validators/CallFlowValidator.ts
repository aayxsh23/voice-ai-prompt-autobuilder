import { CallFlowPlan } from "@/lib/llm/types/CallFlowPlan";
import { PromptCompilationError } from "@/lib/errors/PromptCompilationError";

export function validateCallFlowPlan(plan: CallFlowPlan): void {
  if (!plan || !plan.steps || plan.steps.length === 0) {
    throw new PromptCompilationError("CallFlowPlan steps array is empty or undefined");
  }
  const validTargets = new Set<number | string>();
  for (const step of plan.steps) validTargets.add(step.stepNumber);
  validTargets.add("end_call");
  validTargets.add("transfer");
  for (const step of plan.steps) {
    for (const branch of step.branchingConditions) {
      if (!validTargets.has(branch.goToStep)) {
        throw new PromptCompilationError(
          `Dead-end branch in step ${step.stepNumber} ("${step.label}"): references target "${branch.goToStep}"`
        );
      }
    }
  }
}
