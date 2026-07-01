export interface CallFlowStep {
  stepNumber: number;
  label: string;
  condition: string;
  collectsVariable: string | null;
  generatedLine: string;
  branchingConditions: Array<{ condition: string; goToStep: number | 'end_call' | 'transfer' }>;
  fallbackBehavior: string;
  maxRetries?: number;
}

export interface CallFlowPlan {
  agentName: string;
  primaryGoal: string;
  steps: CallFlowStep[];
  emergencyTriggers: string[];
  outOfScopeTopics: string[];
}
