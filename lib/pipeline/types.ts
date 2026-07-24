import { BusinessSpecification } from "@/lib/llm/types";
export type { BusinessSpecification };
import { FsmStateNode as BaseFsmStateNode } from "@/lib/llm/types/CallFlowPlan";
import { ToolDefinition } from "@/lib/compiler/constants/toolRegistry";

// Ensures Architect states support the required fields for Q2 fixes
export interface FsmStateNode extends BaseFsmStateNode {
  speechPrompt?: string;
  notes?: string[];
  closeVariants?: Array<{ variant: string, script: string }>;
}

// Q4 Fix: Structured classification for captured protocols.
export type ProtocolClassification = 'pure-duplicate' | 'stage-contextual' | 'unique-global' | 'unique-fact';
export interface ClassifiedTopic {
  topic: string;
  classification: ProtocolClassification;
  targetStateId?: string; // Target FSM node ID if stage-contextual
  content: string;
}

export interface GathererOutput {
  businessSpec: BusinessSpecification;
}

export interface ArchitectOutput {
  fsmStates: FsmStateNode[]; 
}

export interface OptimizerInput {
  businessSpec: BusinessSpecification;
  fsmStates: FsmStateNode[];
}

export interface OptimizerOutput {
  globalGuardrails: string[];
  mappedStateNotes: Record<string, string[]>;
  mappedStateCloseVariants: Record<string, string[]>;
  tools: ToolDefinition[];
}

export interface AssemblerInput {
  businessSpec: BusinessSpecification;
  fsmStates: FsmStateNode[];
  globalGuardrails: string[];
  tools: ToolDefinition[];
}

export interface AssemblerOutput {
  finalPrompt: string; // The single monolithic text string
}

export interface JudgeOutput {
  passed: boolean;
  score: number;
  issues: Array<{
    type: 'structural' | 'wording' | 'coverage' | 'security' | 'duplicate_rule' | 'orphaned_protocol' | 'token_bloat';
    culprit: 'architect' | 'optimizer' | 'assembler';
    detail: string;
    suggestedFix?: string;
  }>;
}

export interface WorkflowState {
  compileInputHash: string;
  gathererOutput: GathererOutput | null;
  architectOutput: ArchitectOutput | null;
  optimizerOutput: OptimizerOutput | null;
  assemblerOutput: AssemblerOutput | null;
  judgeOutput: JudgeOutput | null;
  
  attempts: number;
  maxAttempts: number;
  lastFailedStage: 'architect' | 'optimizer' | 'assembler' | null;
}
