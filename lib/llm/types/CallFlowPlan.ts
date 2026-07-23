export interface ToolInvocation {
  tool: string;
  args: Record<string, any>;
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
  args?: Record<string, any>;
  rules?: any[];
}

export interface FsmStateNode {
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

export interface CallFlowPlan {
  agentName: string;
  primaryGoal: string;
  fsmStates?: FsmStateNode[];
  emergencyTriggers: string[];
  outOfScopeTopics: string[];
  entryRouting?: Array<{ trigger: string; targetStateId: string }>;
  userDefinedSteps?: any[];
  dtmfFallback?: { enabled?: boolean; triggerAfterFailures?: number };
  closingScript?: string;
}
