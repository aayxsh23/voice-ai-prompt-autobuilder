import { generateLeadBuilderManifest } from './leadBuilder';
import { evaluateManifest } from './judge/PromptJudge';
import { WorkflowState, MultiAgentManifest } from '../llm/types/MetaAgentSchemas';

const MAX_ITERATIONS = 3;

export async function runMetaOrchestration(spec: any): Promise<MultiAgentManifest> {
  const state: WorkflowState = {
    spec,
    currentManifest: null,
    judgeFeedback: [],
    iteration: 0
  };

  while (state.iteration < MAX_ITERATIONS) {
    // 1. Lead Builder Generation
    state.currentManifest = await generateLeadBuilderManifest(state);

    // 2. Judge Evaluation
    // This assumes evaluateManifest takes a MultiAgentManifest and returns structured feedback
    // such as { isCompliant: boolean, criticalIssues: Array<{ agentTarget, issue, severity }> }
    const judgeReport = await evaluateManifest(state.currentManifest, spec);
    
    if (judgeReport.isCompliant || judgeReport.criticalIssues.length === 0) {
      break; // Manifest approved
    }

    // 3. Feedback Routing
    state.judgeFeedback = judgeReport.criticalIssues;
    state.iteration++;
  }

  if (!state.currentManifest) {
    throw new Error('Failed to generate multi-agent manifest');
  }

  return state.currentManifest;
}
