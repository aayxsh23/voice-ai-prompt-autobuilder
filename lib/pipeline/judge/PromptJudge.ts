import { MultiAgentManifest, AgentRole } from '../../llm/types/MetaAgentSchemas';

export async function evaluateManifest(manifest: MultiAgentManifest, spec: any) {
  const criticalIssues: Array<{ agentTarget: AgentRole; issue: string; severity: string }> = [];
  
  const agents = manifest?.agents || [];
  
  // Structural validation
  for (const agent of agents) {
    if (!agent.systemPrompt) {
      criticalIssues.push({
        agentTarget: agent.role || 'router',
        issue: `Missing required 'systemPrompt' field for agent ${agent.role}. You must provide a comprehensive systemPrompt string.`,
        severity: 'critical'
      });
    }
  }

  // Example heuristic check
  const collectorAgent = agents.find(a => a.role === 'collector');
  if (collectorAgent && !(collectorAgent.systemPrompt || '').toLowerCase().includes('payment')) {
    criticalIssues.push({
      agentTarget: 'collector',
      issue: 'Collector agent lacks PII/Payment guardrails in its systemPrompt.',
      severity: 'critical'
    });
  }

  return {
    isCompliant: criticalIssues.length === 0,
    criticalIssues
  };
}
