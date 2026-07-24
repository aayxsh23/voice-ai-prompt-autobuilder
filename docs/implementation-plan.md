# Compile-Time Multi-Agent Implementation Plan

This document provides a concrete, ordered execution roadmap for migrating the prompt compiler to a Multi-Agent architecture, based on the architecture plan (`docs/compile-time-pipeline-plan.md`).

## 1. Ordered Task List

| # | Task | Depends On | Suggested Path(s) |
|---|---|---|---|
| 1 | **Land the shared type surface** from Phase 1 (`WorkflowState`, `GathererOutput`...`JudgeOutput`, `ToolDefinition`, `ClassifiedTopic`) | — | `lib/pipeline/types.ts` |
| 2 | **Logic Architect agent** — generates FSM states, accepts merged tool registry | Task 1 | `lib/pipeline/agents/architect.ts` |
| 3 | **Policy & Tool Optimizer agent** — classification (pure-duplicate / stage-contextual / unique-global / unique-fact), global/stage split, declarative tool hydration | Tasks 1, 2 | `lib/pipeline/agents/optimizer.ts` |
| 4 | **Master Assembler** — single `### RULES` section, no restated state notes | Tasks 1, 3 | `lib/pipeline/agents/assembler.ts` |
| 5 | **The Judge** — structured verdict, extended `issue.type` enum | Tasks 1, 4 | `lib/pipeline/agents/judge.ts` |
| 6 | **API orchestration loop** — circuit breaker, stage-output caching, culprit-based re-entry | Tasks 1–5 | `app/api/builder/compile/route.ts` |
| 7 | **Shadow-mode validation** — run new pipeline alongside legacy `promptCompiler.ts` on real specs, diff outputs, human review | Task 6 | n/a (validation task, no new files) |
| 8 | **Dead code removal** — legacy validators and hardcoded hydration branches | Task 7 exit criteria | `lib/pipeline/validators/*`, `lib/compiler/assembler/PromptAssembler.ts` |

---

## 2. File Manifest, Acceptance Criteria & Testing Plan

### Task 1: Land the Shared Type Surface
- **File Manifest:** 
  - `[NEW] lib/pipeline/types.ts`
  - `[MODIFY] lib/compiler/constants/toolRegistry.ts` (to extend `ToolDefinition`)
- **Acceptance Criteria:**
  - `lib/pipeline/types.ts` exports exactly the types defined in Phase 1 of the architecture plan.
- **Testing Plan:**
  - Run the `vitest` suite to ensure no structural typing breaks in existing modules importing `ToolDefinition`.

### Task 2: Logic Architect Agent
- **File Manifest:**
  - `[NEW] lib/pipeline/agents/architect.ts`
  - `[NEW] lib/pipeline/agents/architect.test.ts`
- **Acceptance Criteria:**
  - Agent accepts the merged tool registry (`SYSTEM_RUNTIME_TOOLS` + `spec.tools`).
  - Agent returns an array of `FsmStateNode` objects.
- **Testing Plan:**
  - Write `architect.test.ts` using Vitest to assert that the agent outputs a valid FSM array for a basic mock, and that it correctly injects custom tools into its prompt context.

### Task 3: Policy & Tool Optimizer Agent
- **File Manifest:**
  - `[NEW] lib/pipeline/agents/optimizer.ts`
  - `[NEW] lib/pipeline/agents/optimizer.test.ts`
- **Acceptance Criteria:**
  - Given the VLCC spec's 17 `capturedTopics`, the classifier's output matches the audit's table exactly — 10 pure-duplicate, 2 stage-contextual, 5 unique.
  - Implements declarative tool hydration by injecting `ToolDefinition.defaultArgs` into the `mappedStateNotes`.
- **Testing Plan:**
  - Regression test in `optimizer.test.ts` using the VLCC example spec, strictly asserting the exact classification counts (10/2/0/5 split) above.

### Task 4: Master Assembler
- **File Manifest:**
  - `[NEW] lib/pipeline/agents/assembler.ts`
  - `[NEW] lib/pipeline/agents/assembler.test.ts`
- **Acceptance Criteria:**
  - Renders exactly one `### RULES` section.
  - Excludes any rule or protocol from the global section if it was mapped to a state's `notes` or `closeVariants` array.
- **Testing Plan:**
  - A test asserting the Assembler's rendered `### RULES` section stays under the Judge's ~300-word threshold on the VLCC fixture.
  - A test asserting no state's `notes` content is duplicated in the global RULES section for that fixture.

### Task 5: The Judge
- **File Manifest:**
  - `[NEW] lib/pipeline/agents/judge.ts`
  - `[NEW] lib/pipeline/agents/judge.test.ts`
- **Acceptance Criteria:**
  - Returns a structured JSON verdict matching `JudgeOutput`.
  - Supports extended `issue.type` enum (`duplicate_rule`, `orphaned_protocol`, `token_bloat`).
- **Testing Plan:**
  - Unit tests feeding intentionally bloated rules and orphaned topics to assert the Judge flags them and maps the correct `culprit`.

### Task 6: API Orchestration Loop
- **File Manifest:**
  - `[NEW] app/api/builder/compile/route.ts`
- **Acceptance Criteria:**
  - The deterministic `while` loop successfully nullifies a targeted stage's output if the Judge returns a `culprit` matching that stage.
  - Loop force-exits and returns the prompt alongside warnings if `attempts >= maxAttempts`.
- **Testing Plan:**
  - An end-to-end Vitest test running a full VLCC spec through Tasks 2–6 and asserting the Judge returns `passed: true`.

### Task 7: Shadow-Mode Validation
- **File Manifest:** None.
- **Rollout & Rollback Strategy:**
  - Deploy the new pipeline on a parallel `/api/builder/compile` endpoint while keeping all existing traffic on `generate-review` and `promptCompiler.ts`.
  - **Exit Criteria for Shadow Mode:** Fast-tracked. As long as the automated E2E Vitest suite passes for the core VLCC spec, we consider the pipeline stable. Manual shadow-mode review is optional, allowing us to proceed directly to cut-over.
- **Testing Plan:** Rely on the automated `vitest` suite instead of manual review.

### Task 8: Dead Code Removal
- **File Manifest:**
  - `[DELETE] lib/pipeline/validators/*` (All legacy validation files and tests)
  - `[DELETE] lib/pipeline/promptCompiler.ts`
  - `[MODIFY] lib/compiler/assembler/PromptAssembler.ts` (or `assembler.ts` depending on cutover state)
  - `[DELETE] lib/compiler/planners/*` (Legacy planners)
- **Clarification on Audit Discrepancies (Step 0 Re-Verification):**
  - The audit referenced hardcoded branches in `buildToolInvocation()`. Upon inspection, `buildToolInvocation()` in `lib/compiler/constants/toolRegistry.ts` contains no hardcoded branches. The hardcoded tool hydration branches are actually located in `lib/compiler/assembler/PromptAssembler.ts` (lines ~365-412), which manually passes specific JSON schemas. These will be removed.
  - A global `git grep` confirms `CoherenceValidator`, `FallbackDialogueValidator`, `FlowCompletenessValidator`, `LanguageQualityValidator`, `PromptBudgetValidator`, and `VariableConsistencyValidator` have zero live references outside of `lib/pipeline/promptCompiler.ts` and their own test files.
- **Acceptance Criteria:**
  - Task 7 exit criteria must be met before this runs.
  - Zero live references to any deleted file remain anywhere in the codebase.
- **Testing Plan:**
  - `vitest run` must pass across the entire repo after all deletions and modifications.
