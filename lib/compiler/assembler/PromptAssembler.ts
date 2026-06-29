import { StateMachineCompiler } from "@/lib/compiler/compilers/StateMachineCompiler";
import { SafetyCompiler } from "@/lib/compiler/compilers/SafetyCompiler";
import { VoiceAgentIR } from "@/lib/compiler/ir/IntermediateRepresentation";
import { PromptPackageDraft } from "@/lib/llm/types";


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

function buildOffTopicSection(ir: VoiceAgentIR, draft?: any): string {
  const goal = draft?.primaryGoal || ir?.mission?.goal || ir?.meta?.role || "your primary request";
  const outOfScopeList = draft?.outOfScopeTopics || draft?.guardrails?.outOfScopeTopics;
  const outOfScopeText = Array.isArray(outOfScopeList) && outOfScopeList.length > 0
    ? outOfScopeList.slice(0, 3).join(", ")
    : "matters outside this task";

  return `### OFF-TOPIC HANDLING

RULES FOR OFF-TOPIC DEFLECTION:
- If the caller asks about topics unrelated to this call's primary goal (${goal}), deflect politely back to the task.
- First instance (Strike 1): Say: "I'm only equipped to assist with ${goal} today. Shall we continue with that?"
- Second instance on same subject (Strike 2): Say: "I don't have information on that topic, but I can help you complete your request right now. Would you like to proceed?"
- Third total instance (Call Close): If the caller persists on unrelated subjects (${outOfScopeText}) a third time, conclude the call.
Say: "It sounds like you need assistance with matters outside my scope today. Thank you for calling, and please reach out to our support line for further help. Goodbye."`;
}

function buildDynamicGuardrailsSection(ir: VoiceAgentIR, draft?: any): string {
  const company = ir?.meta?.companyName || "the organization";
  const role = ir?.meta?.role || ir?.mission?.goal || "automated assistant";
  const scope = ir?.meta?.contextScope || "assigned workflows";

  const rawTriggers = draft?.guardrails?.emergencyTriggers || draft?.emergencyTriggers;
  const customTriggers: string[] = Array.isArray(rawTriggers) && rawTriggers.length > 0
    ? rawTriggers
    : [
        `Caller reports an urgent crisis, physical emergency, or immediate threat to safety relevant to ${scope}`,
        `Caller expresses severe distress requiring urgent emergency services (police, fire, ambulance)`,
        `Caller states "emergency", "911", "help me immediately", or demands urgent crisis intervention`
      ];

  const emergencyAction = draft?.guardrails?.emergencyAction || `Say: "If you are experiencing an immediate emergency or crisis, please hang up and contact 911 or your local emergency services right away."`;

  const rawProhibitions = draft?.guardrails?.prohibitions || draft?.prohibitions;
  const customProhibitions: string[] = Array.isArray(rawProhibitions) && rawProhibitions.length > 0
    ? rawProhibitions
    : [
        `Never disclose confidential records, account details, or unverified information to unauthorized callers`,
        `Never invent pricing, policies, operational procedures, or staff names not explicitly defined in this prompt`,
        `Never make binding legal, contractual, or financial commitments on behalf of ${company}`,
        `Never provide advice or instructions outside the designated scope of ${role}`,
        `Never store, repeat, or confirm sensitive identity or payment data (SSN, credit cards, CVV, passwords) if volunteered`
      ];

  const triggersFormatted = customTriggers.map(t => typeof t === 'string' ? (t.startsWith('- ') ? t : `- ${t}`) : `- Urgent emergency condition`).join('\n');
  const prohibitionsFormatted = customProhibitions.map(p => typeof p === 'string' ? (p.startsWith('- ') ? p : `- ${p}`) : `- Strict scope adherence`).join('\n');

  return `### MANDATORY EMERGENCY & SCOPE GUARDRAILS — IMMUTABLE

EMERGENCY & CRISIS DETECTION (ANY of the following triggers immediate redirect):
${triggersFormatted}

ON EMERGENCY DETECTION — stop ALL current flow immediately:
${emergencyAction}
Do NOT collect any further information.
Do NOT continue the call flow.
Do NOT ask clarifying questions.
Wait for the caller to confirm safety before resuming any task.

ABSOLUTE PROHIBITIONS:
${prohibitionsFormatted}

Violation of any prohibition above ends the call immediately.`.trim();
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
      buildDynamicGuardrailsSection(ir, actualDraft),
      buildClosingRulesSection(),
      buildAiIdentitySection(ir.identity?.name ?? ir.meta?.agentName ?? "Virtual Assistant"),
      buildOffTopicSection(ir, actualDraft),
      buildEndingRuleSection()
    ];
    return sections.filter(Boolean).join('\n\n');
  }
}
