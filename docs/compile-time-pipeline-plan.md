# Compile-Time Multi-Agent Pipeline

## 1. The Backend Orchestration Loop (State Machine)

- Define the `WorkflowState` object to store individual outputs (`gathererOutput`, `architectOutput`, `optimizerOutput`, `assemblerOutput`, `judgeOutput`). This explicit state management enables retries to resume exactly from the failing stage without repeating upstream work.
- Embed circuit breaker properties (`attempts`, `maxAttempts`) within `WorkflowState`. If `attempts >= maxAttempts`, the compiler will forcefully break the loop and return the best available prompt alongside the Judge's warnings.
- The Next.js API route will execute a deterministic `while` loop, checking the structured JSON verdict from the Judge. The Judge only evaluates; the API route contains the conditional routing logic to nullify the specific stage output flagged by `issue.culprit` and re-enter the loop.

## 2. Solving the Audit Issues via Specialized Agents

- **Token Bloat & Rule Mapping (Fixes Q2 & Q3)**: 
  - The Policy & Tool Optimizer deduplicates rules and maps them directly into specific FSM state `notes`, drastically reducing the token bloat caused by stating protocols 2-3 times. 
  - Truly global rules (e.g., abusive user, audio drop, language switch, hang up, upset, not_interested) are kept centralized, while stage-contextual rules (e.g., cross-sell pushback, retry exhaustion scripts, opening/closing phrases, service issue handling, callback language) are injected directly into the specific owning state's `notes` or `closeVariants` arrays.
  - The Master Assembler will consolidate the Scope & Refusal, Custom Guardrails, and Safety Overrides into a **single `### RULES` section** (targeting ~220 words instead of the current ~2,520-word spread).
  - Speakability/voice-mechanics rules (useful for TTS) are preserved but stated only once.

- **Dynamic Tool Hydration (Fixes Q1)**:
  - The merged tool registry (`SYSTEM_RUNTIME_TOOLS` + `spec.tools`) is passed as a first-class input to the Architect and Optimizer, bypassing the legacy 3-tool hardcoded limit.
  - In Phase 4, the hardcoded per-tool-name branches in `buildToolInvocation()` (referred to functionally as `hydrateToolArgs` in the audit) will be replaced by a declarative `defaultArgs` field on `ToolDefinition`. The registration gate is intentionally kept as it ensures safety.

- **Redundant Operational Protocols (Fixes Q4)**:
  - The Policy & Tool Optimizer receives the `capturedTopics` from the Gatherer and classifies each one using the FSM state list: `pure-duplicate` (dropped), `stage-contextual` (merged into the owning FSM state), `unique-global` (folded into the single global RULES block), or `unique-fact` (relocated to Business Context).

- **Determinism**: We enforce `temperature: 0` for the Optimizer, Assembler, and Judge. Stage outputs will be cached in memory or DB (keyed by their input hash) so that if the Judge flags the `assembler`, the API route instantly retrieves the cached `architectOutput` and `optimizerOutput` rather than re-running them.

## Compile-Time Multi-Agent Implementation

### Phase 1: Complete Type Surface

```typescript
import { BusinessSpecification } from "@/lib/llm/types";
import { FsmStateNode as BaseFsmStateNode } from "@/lib/llm/types/CallFlowPlan";
import { ToolDefinition as BaseToolDefinition } from "@/lib/compiler/constants/toolRegistry";

// Q1 Fix: Extends ToolDefinition with declarative default arguments for robust hydration.
export interface ToolDefinition extends BaseToolDefinition {
  defaultArgs?: Record<string, any>; 
}

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
    // Q3/Q4 Fixes: Extended issue types to catch rule duplication, bloated lengths, and lost topics
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
```

### Phase 2: The API Pipeline
- Implement the Next.js API deterministic `while` loop that calls the Logic Architect, Policy & Tool Optimizer, and Master Assembler in sequence.
- Execute the Judge agent on the final markdown output. If the Judge fails (and `attempts < maxAttempts`), map the `culprit` to nullify that specific stage's output in the `WorkflowState`, and continue the loop to re-execute just that downstream portion.

### Phase 3: Judge JSON Schema
- Draft the strictly-typed JSON schema for the Judge matching `JudgeOutput`. 
- Instruct the Judge to actively identify `duplicate_rule` scenarios (where the same rule exists in multiple sections), track `orphaned_protocol` missing topics (captured topics that do not appear anywhere in the final markdown), and enforce a strict `token_bloat` check (flagging if the consolidated `### RULES` section exceeds roughly 300 words).
- *Note:* The Judge evaluates the rendered prompt content only, not the internal compiler source code.

### Phase 4: Dead Code Removal (Candidates)
- **`lib/pipeline/validators/*`**: The legacy AST/regex-based validators (`CoherenceValidator`, `FallbackDialogueValidator`, `FlowCompletenessValidator`, `LanguageQualityValidator`, `PromptBudgetValidator`, `VariableConsistencyValidator`).
  - *Search Conducted*: Global recursive `git grep` across the codebase for the class names.
  - *Result*: Zero live references remain outside of `lib/pipeline/promptCompiler.ts` (which itself is being entirely rewritten to use this new orchestration pipeline).
- **`buildToolInvocation()` hardcoded tool switch logic**: (Referred to as `hydrateToolArgs` in the original audit context). The legacy hardcoded branches will be removed from `lib/compiler/constants/toolRegistry.ts` (approx line 124) and replaced by parsing `ToolDefinition.defaultArgs` dynamically as a one-time refactoring step.

> **Rejected Recommendation**:
> The audit Priority 6 recommended splitting into runtime agents (e.g., Sales vs Booking behind a router). This has been explicitly considered and rejected. The project constraint dictates a single monolithic prompt output for a single-agent bot. Runtime agent architecture is out of scope.
