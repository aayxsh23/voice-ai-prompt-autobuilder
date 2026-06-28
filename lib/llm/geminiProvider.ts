import { GoogleGenAI } from '@google/genai';
import {
  BlueprintJson,
  BusinessSnapshot,
  CallMission,
  ConversationDesign,
  DynamicVariableSpec,
  GapAuditResult,
  LlmService,
  PromptPackageDraft,
  QualityReview,
  SimulationTurnInput,
  SimulationTurnOutput,
  SuggestedFunctionSpec,
  TestScenarioSpec,
  VoicePersonality,
  safeParseJson,
  ChatMessage,
  BuilderChatTurnResponse,
} from './types';
import { PromptCompilationError } from "@/lib/errors/PromptCompilationError";
import { CallFlowPlan } from "@/lib/llm/types/CallFlowPlan";
import { validateCallFlowPlan } from "@/lib/pipeline/validators/CallFlowValidator";

if (!process.env.GEMINI_API_KEY) {
  throw new Error("FATAL: GEMINI_API_KEY is missing. The compiler cannot run.");
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const COMPILER_GENERATION_CONFIG = {
  temperature: 0.1,
  topP: 0.4,
  topK: 20,
};

export const GLOBAL_COMPILER_INSTRUCTION = `
You are a senior AI voice agent prompt engineer. Your task is to generate production-ready system prompts for voice agents deployed on phone calls.

QUALITY STANDARDS — your output MUST meet ALL of these:

STRUCTURE: Every output must contain these exact sections in this order:
### AGENT IDENTITY
### CONTEXT & VARIABLES
### PRIMARY GOAL
### CALL FLOW
### FAQ & KNOWLEDGE DEFLECTION
### OBJECTION HANDLING
### TTS & VOICE RULES
### TOOL & FUNCTION EXECUTION
### GUARDRAILS
### MANDATORY EMERGENCY & SCOPE GUARDRAILS — IMMUTABLE
### CLOSING RULES
### AI IDENTITY DISCLOSURE
### OFF-TOPIC HANDLING
### ENDING RULE

VOICE RULES (mandatory in every output):
- Every agent turn must be 1–2 short sentences maximum
- Ask ONE question per turn. Never stack questions
- Use Say: "..." syntax for all exact agent dialogue lines
- Phone numbers: spell digit by digit — "four one five, two three four, five six seven eight"
- Dates: say "Monday the fourteenth of July" not "07/14"
- Member IDs / reference numbers: spell character by character
- Email addresses: replace @ with "at", replace . with "dot"
- Never use bullet points, numbered lists, or markdown in spoken dialogue sections
- Natural acknowledgements only: "okay", "got it", "understood", "of course"

CALL FLOW FORMAT: Each step must follow this exact template:
STEP [N]: [STEP LABEL IN CAPS]
Condition: [when this step activates]
Say: "[exact agent line]"
Then: [what to collect or wait for]
Branch: [if X → go to Step Y | if Y → go to Step Z]

FEW-SHOT EXAMPLE — This is what a production-grade call flow step looks like:
STEP 2: COLLECT PATIENT VERIFICATION
Condition: After caller states their request
Say: "Could I get your full name please?"
Then: Wait for caller to provide full name. Store as {{patient_name}}.
Branch: If caller hesitates → Say: "That is just so I can pull up your details. It is kept completely secure." Then re-ask.

FEW-SHOT EXAMPLE — This is what a production-grade FAQ entry looks like:

CLINIC HOURS
Say: "We are open every day from ten in the morning to five in the evening."

INSURANCE COVERAGE
Say: "I am not able to confirm coverage directly. I will pass your insurance details to our team and they will follow up with you."

CRITICAL PROHIBITIONS:
- Never invent clinic hours, addresses, staff names, or policies not provided in the input
- Never stack two questions in the same Say: "..." line
- Never use raw markdown formatting inside spoken dialogue
- Never generate a guardrail as a suggestion — guardrails are non-negotiable rules
- Never use the phrase "As an AI" — if asked, follow the AI IDENTITY DISCLOSURE section format

OUTPUT FORMAT: Plain text with ### section headers. No JSON wrapping. Start output directly with ### AGENT IDENTITY.
`.trim();

export const geminiClient = {
  async generate({ systemInstruction, prompt }: { systemInstruction: string, prompt: string }) {
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        ...COMPILER_GENERATION_CONFIG
      }
    });
    if (!response.text) {
      throw new Error("Compiler Node Failure: LLM returned empty response.");
    }
    return { text: response.text };
  }
};

export class GeminiProvider implements LlmService {
  private aiInstance: GoogleGenAI;
  private modelName: string;

  constructor(apiKey?: string, modelName = 'gemini-3.1-flash-lite') {
    this.modelName = process.env.GEMINI_MODEL || modelName;
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("FATAL: GEMINI_API_KEY is missing in GeminiProvider.");
    }
    this.aiInstance = new GoogleGenAI({ apiKey: key });
  }

  private async generateJson<T>(prompt: string): Promise<T> {
    const jsonInstruction = `\n\nCRITICAL INSTRUCTION:\nReturn valid JSON only.\nDo not include markdown.\nDo not include code fences.\nDo not include explanations outside the JSON object.`;
    const response = await this.aiInstance.models.generateContent({
      model: this.modelName,
      contents: prompt + jsonInstruction,
      config: {
        responseMimeType: "application/json",
        temperature: 0.2
      }
    });
    if (!response.text) {
      throw new Error("Gemini API returned empty response.");
    }
    return safeParseJson<T>(response.text, {} as T);
  }

  public async generateRaw(prompt: string): Promise<string> {
    const response = await this.aiInstance.models.generateContent({
      model: this.modelName,
      contents: prompt,
      config: {
        systemInstruction: GLOBAL_COMPILER_INSTRUCTION,
        ...COMPILER_GENERATION_CONFIG
      }
    });
    if (!response.text || response.text.trim() === "") {
      throw new PromptCompilationError("LLM returned empty or missing response text in generateRaw");
    }
    return response.text;
  }

  async generateWithCoT(input: BlueprintJson): Promise<PromptPackageDraft> {
    const { overrides, ...llmInput } = input;
    const CALL_FLOW_PLAN_SCHEMA = `{"agentName":"string","primaryGoal":"string","steps":[{"stepNumber":"number","label":"string","condition":"string","collectsVariable":"string|null","generatedLine":"string","branchingConditions":[{"condition":"string","goToStep":"number|'end_call'|'transfer'"}],"fallbackBehavior":"string"}],"emergencyTriggers":["string"],"outOfScopeTopics":["string"]}`;
    const pass1Prompt = `You are a voice agent call flow architect. Design logical state transitions.\nOutput ONLY valid JSON matching:\n${CALL_FLOW_PLAN_SCHEMA}\nBusiness input:\n${JSON.stringify(llmInput, null, 2)}`;
    const pass1Raw = await this.generateRaw(pass1Prompt);
    let plan: CallFlowPlan;
    try {
      plan = JSON.parse(pass1Raw.replace(/```json|```/g, '').trim()) as CallFlowPlan;
    } catch {
      throw new PromptCompilationError(`CoT Pass 1 unparseable JSON: ${pass1Raw.substring(0, 300)}`);
    }
    validateCallFlowPlan(plan);
    const PROMPT_PACKAGE_DRAFT_SCHEMA = `{"systemPrompt":"string","agentPrompt":"string","primaryGoal":"string","faqCards":[{"question":"string","answer":"string"}],"objectionCards":[{"trigger":"string","response":"string"}],"dynamicVariables":[{"key":"string","label":"string","description":"string","type":"string","required":true,"defaultValue":"string","source":"string"}],"edgeCaseRules":[{"scenario":"string","action":"string"}]}`;
    const pass2Prompt = `You are a structured data compiler. Output ONLY valid JSON matching:\n${PROMPT_PACKAGE_DRAFT_SCHEMA}\nSystemPrompt must follow plan:\n${JSON.stringify(plan, null, 2)}\nContext:\n${JSON.stringify(llmInput, null, 2)}`;
    const pass2Raw = await this.generateRaw(pass2Prompt);
    let draft: PromptPackageDraft;
    try {
      draft = JSON.parse(pass2Raw.replace(/```json|```/g, '').trim()) as PromptPackageDraft;
    } catch {
      throw new PromptCompilationError(`CoT Pass 2 unparseable JSON: ${pass2Raw.substring(0, 300)}`);
    }
    for (const field of ['systemPrompt', 'faqCards', 'objectionCards'] as const) {
      if (!draft[field]) throw new PromptCompilationError(`Missing required field: ${field}`);
    }
    draft.callFlowSteps = plan.steps;
    return draft;
  }

  async generateConversationDesign(input: { template: string; business: BusinessSnapshot; mission: CallMission }): Promise<ConversationDesign> {
    const prompt = `Design a production-grade conversation flow map for: ${JSON.stringify(input)}. Return JSON matching ConversationDesign.`;
    return this.generateJson<ConversationDesign>(prompt);
  }

  async runGapAudit(input: { business: BusinessSnapshot; mission: CallMission; conversation: ConversationDesign; personality: VoicePersonality }): Promise<GapAuditResult> {
    const prompt = `Audit this voice agent configuration: ${JSON.stringify(input)}. Return JSON matching GapAuditResult.`;
    return this.generateJson<GapAuditResult>(prompt);
  }

  async generateReviewDraft(input: BlueprintJson): Promise<PromptPackageDraft> {
    return this.generateWithCoT(input);
  }

  async generateAgentPrompt(input: BlueprintJson): Promise<string> {
    const draft = await this.generateReviewDraft(input);
    return draft.agentPrompt;
  }

  async generateSystemPrompt(input: BlueprintJson): Promise<string> {
    const draft = await this.generateReviewDraft(input);
    return draft.systemPrompt;
  }

  async extractDynamicVariables(input: BlueprintJson): Promise<DynamicVariableSpec[]> {
    const draft = await this.generateReviewDraft(input);
    return draft.dynamicVariables || [];
  }

  async recommendSuggestedFunctions(input: BlueprintJson): Promise<SuggestedFunctionSpec[]> {
    const draft = await this.generateReviewDraft(input);
    return draft.suggestedFunctions || [];
  }

  async generateKnowledgeBaseSuggestions(input: BlueprintJson): Promise<{ title: string; content: string; category: string }[]> {
    const draft = await this.generateReviewDraft(input);
    return draft.knowledgeBaseSuggestions || [];
  }

  async generateFaqCards(input: BlueprintJson): Promise<{ question: string; answer: string }[]> {
    const draft = await this.generateReviewDraft(input);
    return draft.faqCards || [];
  }

  async generateObjectionCards(input: BlueprintJson): Promise<any[]> {
    const draft = await this.generateReviewDraft(input);
    return draft.objectionCards || [];
  }

  async generateEdgeCaseRules(input: BlueprintJson): Promise<{ scenario: string; action: string }[]> {
    const draft = await this.generateReviewDraft(input);
    return draft.edgeCaseRules || [];
  }

  async generateTestScenarios(input: BlueprintJson): Promise<TestScenarioSpec[]> {
    const draft = await this.generateReviewDraft(input);
    return draft.testScenarios || [];
  }

  async evaluatePromptQuality(agentPrompt: string, systemPrompt: string, useCase: string): Promise<QualityReview> {
    const prompt = `Evaluate this AI voice agent prompt package: Use Case: ${useCase}, Agent Prompt: ${agentPrompt}, System Prompt: ${systemPrompt}. Return JSON matching QualityReview.`;
    return this.generateJson<QualityReview>(prompt);
  }

  async simulatePromptTurn(input: SimulationTurnInput): Promise<SimulationTurnOutput> {
    const prompt = `Simulate one single turn of voice agent phone conversation: ${JSON.stringify(input)}. Return JSON matching SimulationTurnOutput.`;
    return this.generateJson<SimulationTurnOutput>(prompt);
  }

  async improvePromptWithCritique(draft: PromptPackageDraft, critique: QualityReview): Promise<PromptPackageDraft> {
    const prompt = `Improve prompt draft based on critique: Draft: ${JSON.stringify(draft)}, Critique: ${JSON.stringify(critique)}. Return refined PromptPackageDraft JSON.`;
    return this.generateJson<PromptPackageDraft>(prompt);
  }

  async generateBuilderChatReply(messages: ChatMessage[], currentBlueprint: Partial<BlueprintJson>): Promise<BuilderChatTurnResponse> {
    const prompt = `You are an AI voice agent architect helping a user build a production voice agent.
CONVERSATION HISTORY:
${JSON.stringify(messages, null, 2)}

CURRENT BLUEPRINT STATE:
${JSON.stringify(currentBlueprint, null, 2)}

CRITICAL INSTRUCTIONS:
1. NEVER repeat a question or prompt that has already been asked or answered in the conversation history.
2. If the user just provided detailed instructions (such as tone, empathy, validation rules, emergency handling, or agent behavior), ACKNOWLEDGE those specific details warmly. Do not ask for behavioral details again.
3. TURN-TAKING RULE: Keep your "reply" conversational and concise (maximum 1 to 2 short sentences), ending with exactly ONE clear question about any remaining missing details (like phone transfer numbers, booking system names, or specific data slots).
4. COMPLETION DETECTION: If the conversation already contains the core business role, primary goal, and tone/behavioral instructions, set "isReadyToGenerate" to true. When true, your reply should enthusiastically state that you have all required specifications and ask if they are ready to generate the compiler prompt package now!
5. Return ONLY valid JSON matching the exact schema:
{
  "reply": "Your conversational response",
  "isReadyToGenerate": boolean,
  "extractedBlueprint": {
    "business": { "businessName": "", "industry": "" },
    "mission": { "primaryGoal": "" },
    "personality": { "tone": "" }
  },
  "missingDetails": ["Any missing info"]
}`;

    const res = await this.generateJson<BuilderChatTurnResponse>(prompt);
    if (!res || !res.reply) {
      return {
        reply: "Thank you for providing those detailed behavioral and tone specifications! Do you have a specific phone number or booking system we should transfer callers to if they need human assistance?",
        isReadyToGenerate: messages.length >= 3,
        extractedBlueprint: currentBlueprint,
        missingDetails: []
      };
    }
    return res;
  }
}
