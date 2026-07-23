export type AgentRole = 'router' | 'opener' | 'pitch' | 'collector' | 'closer';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
  usageProtocol: string;
}

export interface FsmStateNode {
  id: string;
  objective: string;
  notes: string[];
  edges: Array<{ condition: string; targetStateId: string; targetAgent: AgentRole }>;
}

export interface RuntimeAgent {
  role: AgentRole;
  systemPrompt: string;
  tools: ToolDefinition[];
  ownedStates: FsmStateNode[];
}

export interface MultiAgentManifest {
  globalStateSchema: string[];
  agents: RuntimeAgent[];
}

export interface WorkflowState {
  spec: any; // BusinessSpecification
  currentManifest: MultiAgentManifest | null;
  judgeFeedback: Array<{ agentTarget: AgentRole; issue: string; severity: string }>;
  iteration: number;
}
