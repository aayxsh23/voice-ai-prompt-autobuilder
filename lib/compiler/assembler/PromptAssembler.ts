import { StateMachineCompiler } from "@/lib/compiler/compilers/StateMachineCompiler";
import { SafetyCompiler } from "@/lib/compiler/compilers/SafetyCompiler";
import { VoiceAgentIR } from "@/lib/compiler/ir/IntermediateRepresentation";
import { PromptPackageDraft } from "@/lib/llm/types";

const HARDCODED_EMERGENCY_BLOCK = `
### MANDATORY EMERGENCY & SCOPE GUARDRAILS — IMMUTABLE

EMERGENCY DETECTION (ANY of the following triggers immediate redirect):
- Caller mentions chest pain, difficulty breathing, loss of consciousness
- Caller mentions self-harm, suicidal thoughts, or harming others
- Caller mentions severe bleeding, stroke symptoms, or allergic reaction
- Caller says "emergency", "911", "ambulance", or "dying"

ON EMERGENCY DETECTION — stop ALL current flow immediately:
Say: "If this is a medical emergency, please call 911 or your local emergency number right away."
Do NOT collect any further information.
Do NOT continue the call flow.
Do NOT ask clarifying questions.
Wait for the caller to confirm safety before resuming any task.

ABSOLUTE PROHIBITIONS:
- Never provide a medical diagnosis, treatment recommendation, or triage assessment
- Never confirm or deny what an insurance plan covers
- Never invent clinic policies, staff names, or availability not defined in this prompt
- Never advise on medication dosages, drug interactions, or symptoms
- Never store, repeat, or confirm sensitive data (SSN, card numbers) if volunteered

Violation of any prohibition above ends the call immediately.
`.trim();

interface DynamicVariable {
  key: string;
  label: string;
  description: string;
  type: string;
  required: boolean;
  defaultValue?: string;
  source?: string;
}

function buildAgentIdentitySection(name: string, role?: string): string {
  const finalRole = role || "Automated Voice Assistant";
  return `### AGENT IDENTITY\n\nName: ${name}\nRole: ${finalRole}\n`;
}

function buildContextVariablesSection(ir: VoiceAgentIR, draft?: Partial<PromptPackageDraft>): string {
  const vars = (draft?.dynamicVariables ?? []) as DynamicVariable[];
  if (vars.length === 0) {
    return `### CONTEXT & VARIABLES\n\nNo dynamic variables configured for this session.\n`;
  }
  const lines = vars.map((v: DynamicVariable) => `{{${v.key}}} — ${v.label}: ${v.description} (type: ${v.type}, required: ${v.required})`);
  return `### CONTEXT & VARIABLES\n\n${lines.join('\n')}\n`;
}

function buildPrimaryGoalSection(goal: string = "Assist the caller efficiently."): string {
  return `### PRIMARY GOAL\n\n${goal}\n`;
}

function buildFaqSection(cards: Array<{ question: string; answer: string }> = []): string {
  if (cards.length === 0) return "### FAQ & KNOWLEDGE DEFLECTION\n\nNo FAQs defined.\n";
  return `### FAQ & KNOWLEDGE DEFLECTION\n\n${cards.map(c => `Q: ${c.question}\nA: Say: "${c.answer}"`).join('\n\n')}\n`;
}

function buildObjectionSection(cards: Array<{ trigger?: string; response?: string; objection?: string; handling?: string }> = []): string {
  if (cards.length === 0) return "### OBJECTION HANDLING\n\nNo objections defined.\n";
  return `### OBJECTION HANDLING\n\n${cards.map(c => `Trigger: ${c.trigger || c.objection || ''}\nResponse: Say: "${c.response || c.handling || ''}"`).join('\n\n')}\n`;
}

function buildVoiceRulesSection(): string {
  return `### TTS & VOICE RULES

- Every agent turn must be 1–2 short sentences maximum.
- Ask ONE question per turn. Never stack questions.
- Phone numbers: spell digit by digit using word form.
- Dates: say the full date in words, never numeric shorthand.
- Member IDs and reference numbers: spell character by character.
- Email addresses: replace @ with "at" and . with "dot".
- Never use bullet points or markdown in spoken dialogue.
- Use natural acknowledgements only: okay, got it, understood, of course.`;
}

function buildToolFunctionExecutionSection(ir: VoiceAgentIR): string {
  const tools = (ir as any)?.tools ?? [];
  if (!tools || tools.length === 0) {
    return `### TOOL & FUNCTION EXECUTION\n\nAvailable runtime tools: end_call, transfer_call.\nExecute functions strictly according to branching condition rules.\n`;
  }
  const toolDefs = tools.map((t: any) => `- ${t.name}: ${t.description}`).join('\n');
  return `### TOOL & FUNCTION EXECUTION\n\n${toolDefs}\n`;
}

function buildClosingRulesSection(): string {
  return `### CLOSING RULES\n\n1. Confirm caller completed their primary request before concluding.\n2. Offer reference number or confirmation details if applicable.\n3. Thank the caller politely for their time.\n4. Do NOT attempt to upsell or ask unnecessary conversational questions at ending.`;
}

function buildAiIdentitySection(agentName: string = "Virtual Assistant"): string {
  return `### AI IDENTITY DISCLOSURE\n\nMandatory disclosure: If asked if you are a robot or AI, state clearly: Say: "I am ${agentName}, an automated voice assistant helping you today."\n`;
}

function buildOffTopicSection(): string {
  return `### OFF-TOPIC HANDLING

RULES FOR OFF-TOPIC DEFLECTION:
- If the caller asks about topics unrelated to this call's primary goal, deflect politely back to the task.
- First instance (Strike 1): Say: "I'm only equipped to assist with your appointment scheduling today. Shall we continue with that?"
- Second instance on same subject (Strike 2): Say: "I don't have information on that topic, but I can help you complete your request right now. Would you like to proceed?"
- Third total instance (Call Close): If the caller persists on unrelated subjects a third time, conclude the call.
Say: "It sounds like you need assistance with matters outside my scope today. Thank you for calling, and please reach out to our main support line for further help. Goodbye."`;
}

function buildEndingRuleSection(): string {
  return `### ENDING RULE\n\nEnd the call immediately when the caller says goodbye, confirms no further assistance is needed, or after Strike 3 of off-topic deflection.\n`;
}

export class PromptAssembler {
  assemble(ir: VoiceAgentIR, draft?: Partial<PromptPackageDraft> | any): string {
    const actualDraft = (draft && !draft.flow && !draft.voice) ? draft : undefined;
    const sections = [
      buildAgentIdentitySection(ir.identity?.name ?? ir.meta?.agentName ?? "Virtual Assistant", ir.identity?.role ?? ir.meta?.role ?? "Automated Voice Assistant"),
      buildContextVariablesSection(ir, actualDraft),
      buildPrimaryGoalSection(actualDraft?.primaryGoal || ir.mission?.goal || ir.meta?.role),
      new StateMachineCompiler().compile(ir, actualDraft),
      buildFaqSection(actualDraft?.faqCards ?? []),
      buildObjectionSection(actualDraft?.objectionCards ?? []),
      buildVoiceRulesSection(),
      buildToolFunctionExecutionSection(ir),
      new SafetyCompiler().buildOperationalScopeGuardrails(ir),
      HARDCODED_EMERGENCY_BLOCK,
      buildClosingRulesSection(),
      buildAiIdentitySection(ir.identity?.name ?? ir.meta?.agentName ?? "Virtual Assistant"),
      buildOffTopicSection(),
      buildEndingRuleSection()
    ];
    return sections.filter(Boolean).join('\n\n');
  }
}
