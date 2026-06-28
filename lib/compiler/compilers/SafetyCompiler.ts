import { VoiceAgentIR } from "../ir/IntermediateRepresentation";

export class SafetyCompiler {
  public buildOperationalScopeGuardrails(ir: VoiceAgentIR): string {
    const scope = ir?.meta?.contextScope ?? 'general';
    return `### GUARDRAILS\n\nOPERATIONAL SCOPE: ${scope}\n- ASR Dropout Protocol: If caller says "Hello?" out of context, pause and ask "Can you hear me clearly?" before resuming.\n- Correction Routing: If caller corrects slot data, silently update slot and acknowledge without restarting call flow.\n`;
  }

  public compile(ir: VoiceAgentIR): string {
    return this.buildOperationalScopeGuardrails(ir);
  }
}
