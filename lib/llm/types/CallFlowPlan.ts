export interface ToolInvocation {
  tool: string;
  args: Record<string, Record<string, unknown>>;
  executeBeforeSpeech?: boolean;
  speechPrompt?: string;
}

export interface FsmEdge {
  condition: string;
  targetStateId: string;
  action?: string;
  speechPrompt?: string;
  closeVariant?: string;
}

export interface FsmSubProtocol {
  name: string;
  args?: Record<string, Record<string, unknown>>;
  rules?: Record<string, unknown>[];
}

export interface FsmStateNode {
  [key: string]: any;
  id: string;
  objective: string;
  speechPrompt?: string;
  
  // Graph edges routing to other state IDs
  edges: FsmEdge[];
  
  // Graph-centric error/retry loops that can point to other states
  retryPolicy?: {
    maxAttempts?: number;
    onExhausted?: { targetStateId: string };
  };
  
  slotsToCollect?: string[];
  orderIndependent?: boolean;
  skipCondition?: string;
  
  entryAction?: ToolInvocation;
  inTurnTool?: ToolInvocation;
  
  subProtocol?: string | FsmSubProtocol;
  subLoop?: { selfLoop?: boolean; triggerCondition?: string };
  closeVariants?: Array<{ variant: string; script: string }>;
  
  optional?: boolean;
  maxTurns?: number;
  direction?: string;
  isTerminal?: boolean;
  spoken?: boolean;
  notes?: string[];
}

// Legacy step interface, kept strictly for backward compatibility
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
  notes?: string[];
}

export interface CallFlowPlan {
  agentName: string;
  primaryGoal: string;
  fsmStates?: FsmStateNode[]; // Primary structure: Graph-based FSM
  steps?: CallFlowStep[]; // Legacy structure
  
  emergencyTriggers: string[];
  outOfScopeTopics: string[];
  
  entryRouting?: Array<{ trigger: string; targetStateId: string }>;
  userDefinedSteps?: Record<string, unknown>[];

  interruptionPolicy?: string;
  digressionPolicy?: string;
  confirmationStyle?: string;
  dtmfFallback?: { enabled?: boolean; triggerAfterFailures?: number };
  closingScript?: string;
}
