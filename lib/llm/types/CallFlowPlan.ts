export interface CallFlowStep {
  stepNumber?: number;
  sequenceOrder?: number;
  stateId?: string;
  stateName?: string;
  objective?: string;
  label?: string;
  condition?: string;
  scriptDirective?: string;
  generatedLine?: string;
  slotsToCollect?: string[];
  collectsVariable?: string | null;
  branchingConditions?: Array<{ condition: string; goToStep: number | 'end_call' | 'transfer' | string; action?: string; reason?: string }>;
  fallbackBehavior?: string;
  maxRetries?: number;
  invokesTools?: string[];
  isFallback?: boolean;
  isTerminal?: boolean;
  onFailure?: { afterRetries?: number; action?: string; target?: string; fallbackLine?: string };
  confirmationRequired?: boolean;
  digressionAllowed?: boolean;
}

export interface CallFlowPlan {
  agentName: string;
  primaryGoal: string;
  script?: string;
  steps?: CallFlowStep[];
  emergencyTriggers: string[];
  outOfScopeTopics: string[];
  userDefinedSteps?: any[];
  entryRouting?: Array<{ trigger: string; goToStep: string | number }>;
  silenceHandling?: { timeoutSeconds?: number; action?: string; maxReprompts?: number };
  interruptionPolicy?: string;
  digressionPolicy?: string;
  confirmationStyle?: string;
  dtmfFallback?: { enabled?: boolean; triggerAfterFailures?: number };
  closingScript?: string;
}
