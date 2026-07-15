import OpenAI from 'openai';
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
import { llmConfig } from "@/lib/config";
import { fewShotBlock } from "@/lib/llm/fewshot";
import { logger } from "@/lib/logger";

export const COMPILER_GENERATION_CONFIG = {
  temperature: 0.1,
  topP: 0.4,
  topK: 20,
};

export const GLOBAL_COMPILER_INSTRUCTION = `
You are a senior AI voice agent prompt engineer. Your task is to generate production-ready system prompts for voice agents deployed on phone calls.

QUALITY STANDARDS — your output MUST meet ALL of these:

STRUCTURE: Every output must contain these exact sections in this order:
### AGENT IDENTITY & PERSONA
### LANGUAGE HANDLING
### OUTPUT & VOICE MECHANICS
### AVAILABLE TOOLS
### SCOPE & REFUSAL BEHAVIOR
### MANDATORY EMERGENCY & SAFETY OVERRIDES
### BUSINESS CONTEXT & STATIC FACTS
### ESCALATION & ROUTING MAP
### DYNAMIC VARIABLES
### CALL FLOW
### FAQ (FREQUENTLY ASKED QUESTIONS)
### OBJECTION HANDLING

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
- For Hindi or Multilingual prompts, follow language detection protocol and generate dialogue lines in the appropriate language (Hindi/Hinglish or dual EN/HI).

CALL FLOW FORMAT: Each step must follow this exact template:
STEP [N]: [STEP LABEL IN CAPS]
Condition: [when this step activates]
Say: "[exact agent line]"
Then: [what to collect or wait for]
Branch: [if X → go to Step Y | if Y → go to Step Z]

FEW-SHOT EXAMPLE — This is what a production-grade call flow step looks like:
STEP 2: COLLECT CLIENT VERIFICATION
Condition: After caller states their request
Say: "Could I get your full name please?"
Then: Wait for caller to provide full name. Store as {{client_name}}.
Branch: If caller hesitates → Say: "That is just so I can pull up your details in our system. It is kept completely secure." Then re-ask.

FEW-SHOT EXAMPLE — This is what a production-grade FAQ entry looks like:

BUSINESS HOURS
Say: "We are open Monday through Friday from nine in the morning to six in the evening."

SERVICE INQUIRY
Say: "I can assist with verifying your account details. For specific billing inquiries, I will connect you with our specialist team."

CRITICAL PROHIBITIONS:
- Never invent company hours, addresses, staff names, or policies not provided in the input
- Never stack two questions in the same Say: "..." line
- Never use raw markdown formatting inside spoken dialogue
- Never generate a guardrail as a suggestion — guardrails are non-negotiable rules
- Never use the phrase "As an AI" — if asked, follow the AI IDENTITY DISCLOSURE section format

OUTPUT FORMAT: Plain text with ### section headers. No JSON wrapping. Start output directly with ### AGENT IDENTITY & PERSONA.
`.trim();

// Keeps generated content dense (Aakash-style), not token-heavy (FITTR-style).
// Appended to the structured-generation passes.
const DENSITY_DIRECTIVE = `
DENSITY & ANTI-BLOAT (KEEP IT LEAN):
- Each scriptDirective / fallback line: 1-2 short spoken sentences. No rationale, no meta-commentary, no "(this is because...)".
- Keep FAQ and objection answers to 1-2 spoken sentences each. Do not pad.
- State each rule once. Never restate global policies inside individual steps or cross-reference other sections.`;

function stripThinkTags(text: string): string {
  if (!text) return "";
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

function extractAndLogThinking(response: any, contextLabel = "LLM Call"): string {
  const choice = response.choices?.[0];
  const message = choice?.message || {};
  
  // 1. Check for native reasoning field (`reasoning_content` in vLLM/DeepSeek/Qwen APIs)
  const nativeThinking = message.reasoning_content || message.reasoning || "";
  
  // 2. Check for <think> tags inside `content`
  const rawContent = message.content || "";
  const tagMatch = rawContent.match(/<think>([\s\S]*?)<\/think>/i);
  const tagThinking = tagMatch ? tagMatch[1].trim() : "";
  
  const extractedThinking = nativeThinking || tagThinking;
  if (extractedThinking) {
    logger.debug(`Qwen thinking tokens (${contextLabel})`, extractedThinking);
  }
  return rawContent;
}

function getOpenAIClient(apiKey?: string, baseUrl?: string): OpenAI {
  return new OpenAI({
    apiKey: apiKey || llmConfig.apiKey,
    baseURL: baseUrl || llmConfig.baseUrl,
    // Fail fast on hangs; the SDK retries transient failures with exponential backoff.
    timeout: llmConfig.timeoutMs,
    maxRetries: llmConfig.maxRetries,
  });
}

export const llmClient = {
  async generate({ systemInstruction, prompt, responseMimeType }: { systemInstruction: string, prompt: string, responseMimeType?: string }) {
    const isJson = responseMimeType === "application/json" || systemInstruction?.toLowerCase().includes("json") || prompt?.includes("JSON");
    const client = getOpenAIClient();
    const model = llmConfig.model;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (systemInstruction && systemInstruction.trim() !== "") {
      messages.push({ role: "system", content: systemInstruction });
    }
    messages.push({ role: "user", content: prompt });

    const response = await client.chat.completions.create({
      model,
      messages,
      temperature: 0.1,
      ...(isJson ? { response_format: { type: "json_object" as const } } : {}),
      chat_template_kwargs: { enable_thinking: true },
    } as any);

    const rawContent = extractAndLogThinking(response, "llmClient.generate");
    const cleanContent = stripThinkTags(rawContent);

    if (!cleanContent) {
      throw new Error("Compiler Node Failure: LLM returned empty response.");
    }
    return { text: cleanContent };
  }
};

// Backward-compatibility alias so any existing code importing geminiClient still works seamlessly
export const geminiClient = llmClient;

export class QwenProvider implements LlmService {
  private client: OpenAI;
  private modelName: string;

  constructor(apiKey?: string, modelName?: string, baseUrl?: string) {
    this.modelName = modelName || llmConfig.model;
    this.client = getOpenAIClient(apiKey, baseUrl);
  }

  private async generateJson<T>(prompt: string): Promise<T> {
    const jsonInstruction = `\n\nCRITICAL INSTRUCTION:\nReturn valid JSON only.\nDo not include markdown.\nDo not include code fences.\nDo not include explanations outside the JSON object.`;
    const response = await this.client.chat.completions.create({
      model: this.modelName,
      messages: [
        { role: "user", content: prompt + jsonInstruction }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" as const },
      chat_template_kwargs: { enable_thinking: true },
    } as any);

    const rawContent = extractAndLogThinking(response, "generateJson");
    const cleanContent = stripThinkTags(rawContent);

    if (!cleanContent) {
      throw new Error("Qwen API returned empty response.");
    }
    return safeParseJson<T>(cleanContent, {} as T);
  }

  public async generateRaw(prompt: string, temperature = 0.1): Promise<string> {
    const isJsonRequest = prompt.includes("ONLY valid JSON") || prompt.includes("JSON matching");
    const response = await this.client.chat.completions.create({
      model: this.modelName,
      messages: [
        {
          role: "system",
          content: isJsonRequest
            ? "You are an expert AI voice agent architect. Output strictly valid JSON matching the schema requested without markdown formatting or code fences."
            : GLOBAL_COMPILER_INSTRUCTION,
        },
        { role: "user", content: prompt }
      ],
      temperature,
      ...(isJsonRequest ? { response_format: { type: "json_object" as const } } : {}),
      chat_template_kwargs: { enable_thinking: true },
    } as any);

    const rawContent = extractAndLogThinking(response, "generateRaw");
    const cleanContent = stripThinkTags(rawContent);

    if (!cleanContent || cleanContent.trim() === "") {
      throw new PromptCompilationError("LLM returned empty or missing response text in generateRaw");
    }
    return cleanContent;
  }

  async generateWithCoT(input: BlueprintJson): Promise<PromptPackageDraft> {
    const { overrides, ...llmInput } = input;
    const languageMode = input.languageMode || input.business?.languageMode || (input as any).businessSpec?.meta?.languageMode || 'english';
    // Primary output language follows the declared mode only (multilingual/English
    // default stays English; the agent switches to Hindi live, not by pre-writing it).
    const isHindiOrHinglish = languageMode === 'hindi' || languageMode === 'hinglish';
    const langNote = isHindiOrHinglish
      ? "\nCRITICAL LANGUAGE MANDATE (DEVANAGARI STRICT RULE):\n1. All dialogue lines ('generatedLine', 'fallbackBehavior', 'scriptDirective'), FAQ questions/answers ('question', 'answer'), and objection handling triggers/responses ('trigger', 'response') MUST be written entirely in Devanagari script (देवनागरी), NOT Romanized/English letters.\n2. NEVER write common Hindi words ('kya', 'ho', 'hai', 'baat', 'kar', `rahi`, 'hoon', 'sir', 'maam', 'namaste', 'haan', 'nahi') or Indian names ('Deepika', 'Ananya') in English letters! Write them strictly in Devanagari ('क्या', 'हो', 'है', 'बात', 'कर', 'रही', 'हूँ', 'सर/मैम', 'नमस्ते', 'हाँ', `नहीं`, 'दीपिका', 'अनन्या').\n3. ONLY specific technical/domain software keywords (like 'Marg ERP', 'business owner', 'online demo', 'software', 'accounting', 'inventory', 'billing', 'pincode', 'team', 'office', 'schedule') can remain in English characters inside the Devanagari sentence.\n4. Do NOT output duplicate questions/objections — never output both a Romanized and a Devanagari version of the same FAQ or objection. Output ONLY the Devanagari version."
      : languageMode === 'multilingual'
      ? "\nCRITICAL LANGUAGE MANDATE: Support English, Hindi, and Hinglish. When generating Hindi sentences in dialogue, FAQ answers, or objection responses, they MUST be written in Devanagari script (देवनागरी), not Roman script."
      : "";
    const styleExemplars = fewShotBlock({ policy: { mode: languageMode as 'english' | 'hindi' | 'hinglish' | 'multilingual' } });
    const CALL_FLOW_PLAN_SCHEMA = `{"agentName":"string","primaryGoal":"string","steps":[{"sequenceOrder":"number","stateId":"string","stateName":"string","objective":"string","slotsToCollect":["string"],"scriptDirective":"string","branchingConditions":[{"condition":"string","goToStep":"number|'end_call'|'transfer'"}],"fallbackBehavior":"string","maxRetries":3,"invokesTools":["string"]}],"emergencyTriggers":["string"],"outOfScopeTopics":["string"]}`;
    const pass1Prompt = `You are a voice agent call flow architect. Design logical state transitions.
Output ONLY valid JSON matching:\n${CALL_FLOW_PLAN_SCHEMA}

MANDATORY RULES FOR CALL FLOW GENERATION:
1. ONE QUESTION PER TURN: Ask exactly ONE question or prompt in each step. Never stack multiple questions in a single turn.
2. DEDICATED SLOT STEPS: If multiple variables/outfields must be collected (e.g. fitness_goal, health_concerns, language_preference, callback_time), generate ONE dedicated state step for each slot! Never collect more than one slot in a single step.
3. BRANCHING & ROUTING: Every step must include explicit 'branchingConditions' indicating transitions (e.g., if confirmed -> goToStep N; if busy/wrong number -> goToStep 'end_call' or 'transfer').
4. READ-BACK CONFIRMATION: The step right before the final closing step MUST be a 'Confirmation Read-Back' step where the agent reads back all collected slots to verify accuracy.
5. WIRE END_CALL ON TERMINAL STEPS: The final closing step and all terminal error/refusal branches MUST specify 'end_call' in their branching transition ('goToStep: "end_call"') OR in 'invokesTools: ["end_call"]'.
6. FALLBACK DIALOGUE: Every fallbackBehavior MUST be written as exact spoken dialogue starting with Say:.
7. RETRY LIMITS: Each step that collects information must include maxRetries: 3.${langNote}${DENSITY_DIRECTIVE}${styleExemplars}

Business input:\n${JSON.stringify(llmInput, null, 2)}`;
    const pass1Raw = await this.generateRaw(pass1Prompt);
    let plan: CallFlowPlan = safeParseJson<CallFlowPlan>(pass1Raw, {
      agentName: "Voice Assistant",
      primaryGoal: "Assist callers",
      steps: []
    } as any);
    if (!plan || !Array.isArray(plan.steps)) {
      try {
        plan = JSON.parse(pass1Raw.replace(/```json|```/g, '').trim()) as CallFlowPlan;
      } catch {
        throw new PromptCompilationError(`CoT Pass 1 unparseable JSON: ${pass1Raw.substring(0, 300)}`);
      }
    }
    const PROMPT_PACKAGE_DRAFT_SCHEMA = `{"systemPrompt":"string","agentPrompt":"string","primaryGoal":"string","faqCards":[{"question":"string","answer":"string"}],"objectionCards":[{"trigger":"string","response":"string"}],"dynamicVariables":[{"key":"string","label":"string","description":"string","type":"string","fieldDirection":"'infield'|'outfield'","required":true,"defaultValue":"string","source":"string"}],"edgeCaseRules":[{"scenario":"string","action":"string"}],"guardrails":{"emergencyTriggers":["string"],"emergencyAction":"string","prohibitions":["string"]}}`;
    const pass2Prompt = `You are a structured data compiler. Output ONLY valid JSON matching:\n${PROMPT_PACKAGE_DRAFT_SCHEMA}
${langNote}

FAQ GENERATION RULE: Generate 3-5 concise FAQ entries covering only the most common, business-specific caller questions (do not pad — the agent answers the rest from business context at runtime). For UNKNOWN facts, generate deflection answers. Never generate "No FAQs defined."${langNote}${DENSITY_DIRECTIVE}${styleExemplars}

GUARDRAIL GENERATION RULES:
1. Generate 5-8 guardrails specific to THIS exact business.
2. Each guardrail must be ENFORCEABLE with specific sub-cases.
3. Include at least 2 BEHAVIORAL guardrails (what to DO, not just prohibitions).
4. Include an INVENTION prohibition specific to this business.

VARIABLE CLASSIFICATION RULE:
1. INFIELDS (Pre-Call Context): An infield can NEVER be an extraction (i.e., inside 'collectsVariable' or collected during call flow). Furthermore, you CANNOT create or invent any infields on your own — infields MUST be explicitly specified by the user as pre-call context. If the user did not explicitly specify any pre-call variables, set ZERO infields.
2. OUTFIELDS (Post-Call Extraction): All details collected or extracted from the conversation transcript ('collectsVariable', 'interest_status', 'demo_type', 'pincode') MUST be marked as 'fieldDirection: "outfield"' and referenced with '[variable_name]' syntax in extractions.

SystemPrompt must follow plan:\n${JSON.stringify(plan, null, 2)}\nContext:\n${JSON.stringify(llmInput, null, 2)}`;
    // Structure (pass 1) stays deterministic; the dialogue-heavy draft (pass 2)
    // gets a modest temperature bump for more natural spoken lines. JSON validity
    // is still enforced by response_format.
    const pass2Raw = await this.generateRaw(pass2Prompt, 0.35);
    let draft: PromptPackageDraft = safeParseJson<PromptPackageDraft>(pass2Raw, {} as any);
    if (!draft || (!draft.systemPrompt && !draft.faqCards)) {
      try {
        draft = JSON.parse(pass2Raw.replace(/```json|```/g, '').trim()) as PromptPackageDraft;
      } catch {
        throw new PromptCompilationError(`CoT Pass 2 unparseable JSON: ${pass2Raw.substring(0, 300)}`);
      }
    }
    draft.systemPrompt = draft.systemPrompt || "You are a helpful voice AI assistant.";
    draft.faqCards = Array.isArray(draft.faqCards) ? draft.faqCards : [];
    draft.objectionCards = Array.isArray(draft.objectionCards) ? draft.objectionCards : [];
    draft.dynamicVariables = Array.isArray(draft.dynamicVariables) ? draft.dynamicVariables : [];
    draft.callFlowSteps = Array.isArray(plan.steps) ? plan.steps.map((s: any, idx: number) => ({
      sequenceOrder: s.sequenceOrder || s.stepNumber || idx + 1,
      stateId: s.stateId || `step_${idx + 1}`,
      stateName: s.stateName || s.label || `Step ${idx + 1}`,
      objective: s.objective || s.stateName || s.label || `Step ${idx + 1}`,
      scriptDirective: s.scriptDirective || (s.generatedLine ? `Say: "${s.generatedLine}"` : `Say: "How can I help you?"`),
      slotsToCollect: Array.isArray(s.slotsToCollect) ? s.slotsToCollect : (s.collectsVariable ? [String(s.collectsVariable)] : []),
      branchingConditions: Array.isArray(s.branchingConditions) ? s.branchingConditions : [],
      fallbackBehavior: s.fallbackBehavior || "",
      maxRetries: s.maxRetries || 3,
      invokesTools: Array.isArray(s.invokesTools) ? s.invokesTools : []
    })) : [];
    draft.emergencyTriggers = Array.isArray(plan.emergencyTriggers) ? plan.emergencyTriggers : [];
    draft.outOfScopeTopics = Array.isArray(plan.outOfScopeTopics) ? plan.outOfScopeTopics : [];
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
    return draft.finalPrompt || draft.agentPrompt || "";
  }

  async generateSystemPrompt(input: BlueprintJson): Promise<string> {
    const draft = await this.generateReviewDraft(input);
    return draft.finalPrompt || draft.systemPrompt || "";
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
    const prompt = `You are simulating a voice agent in a phone conversation using the provided system and agent prompts.
Input Context:
- Caller Utterance: "${input.callerMessage}"
- Persona: ${input.persona}
- Current Agent Prompt:
${input.currentAgentPrompt}
- Current System Prompt:
${input.currentSystemPrompt}
- Conversation History:
${JSON.stringify(input.conversationHistory || [], null, 2)}

Simulate exactly one single turn of the AI agent responding to the caller.
CRITICAL TOOL INVOCATION CHECK:
Check if any telephony runtime tools (e.g. \`validate_digit_input\`, \`set_capture_mode\`, \`end_call\`, \`format_email_for_voice\`, \`format_email_for_voice_no_comma\`) or domain business tools should be invoked on this turn based on the prompt instructions and what the caller just said.
If tools should be called right now (for instance when asking for/collecting/validating digits, emails, or terminating the call), list them in the \`toolCalls\` array.

Return a JSON object strictly matching this schema:
{
  "simulatedResponse": "The exact spoken words the agent utters in this turn",
  "detectedIntent": "The caller's detected intent or request",
  "collectedVariables": { "field_name": "extracted_value" },
  "nextRequiredField": "Next variable to collect, if any",
  "guardrailTriggered": false,
  "issueNotes": "Any policy violations or edge cases noted during this turn",
  "toolCalls": [
    {
      "name": "tool_name",
      "arguments": { "arg_name": "value" }
    }
  ]
}`;
    return this.generateJson<SimulationTurnOutput>(prompt);
  }

  async improvePromptWithCritique(draft: PromptPackageDraft, critique: QualityReview): Promise<PromptPackageDraft> {
    const prompt = `Improve prompt draft based on critique: Draft: ${JSON.stringify(draft)}, Critique: ${JSON.stringify(critique)}. Return refined PromptPackageDraft JSON.`;
    return this.generateJson<PromptPackageDraft>(prompt);
  }

  async generateBuilderChatReply(messages: ChatMessage[], currentBlueprint: Partial<BlueprintJson>): Promise<BuilderChatTurnResponse> {
    const languageMode = currentBlueprint?.languageMode || currentBlueprint?.business?.languageMode || 'english';
    const langInstruction = languageMode === 'hindi'
      ? "\nLANGUAGE DIRECTIVE: Conduct this discovery interview in warm, conversational Hindi (Devanagari or Romanized/Hinglish)."
      : languageMode === 'multilingual'
      ? "\nLANGUAGE DIRECTIVE: Conduct this interview in English, but acknowledge and keep in mind that the voice agent will be multilingual (English, Hindi, Hinglish)."
      : "";
    const prompt = `You are an expert AI voice agent architect conducting an in-depth discovery interview with a user to build a highly detailed, production-grade prompt package.${langInstruction}

CONVERSATION HISTORY:
${JSON.stringify(messages, null, 2)}

CURRENT BLUEPRINT STATE:
${JSON.stringify(currentBlueprint, null, 2)}

CRITICAL INTERVIEW & ARCHITECTURE INSTRUCTIONS:
INTAKE FRAMEWORK — you must cover these 8 categories across the conversation.
For each uncovered category, generate ONE natural question in the user's domain language. Do NOT ask meta-questions about prompts — ask about the user's business reality.

[1] REQUEST TYPES & SUB-FLOWS (request_types): What distinct request types does this agent handle? Is this inbound, outbound, or both?
[2] CALLER SEGMENTATION (caller_segmentation): Any meaningful caller type distinctions that change the flow? (new vs returning, verified vs unverified)
[3] OPERATIONAL CONTEXT (operational_context): What facts does the agent need to answer common questions? (hours, location, policies, confirmation method)
[4] DATA COLLECTION SLOTS (data_collection): What information must the agent collect, in what order, with what validation?
[5] ESCALATION & TRANSFER (escalation_triggers): When should the agent stop and transfer? What conditions, number, department?
[6] FORBIDDEN ACTIONS (forbidden_actions): What must the agent absolutely never do, say, or promise?
[7] FAQ CONTENT (faq_content): Top 3-5 caller questions with exact answers.
[8] POST-CALL OUTCOME (post_call_action): What happens after the call? (text, email, callback, human review)

QUESTION STYLE:
INSTEAD OF: "What checklist items should the agent collect?"
ASK: "Walk me through a perfect call from start to finish — what information does the agent gather along the way?"

INSTEAD OF: "What are your guardrails?"
ASK: "What are the two or three things your agent should absolutely never say or do, even if a caller pushes hard?"

Also ask once (not a category):
- Target deployment platform (Bland, Retell, Vapi, or generic)?
- Any silence timeout or barge-in preferences?

In "missingDetails", return the IDs of categories not yet covered ("request_types", "caller_segmentation", "operational_context", "data_collection", "escalation_triggers", "forbidden_actions", "faq_content", "post_call_action").
Set "isReadyToGenerate" only when ALL 8 required categories are populated or clearly addressed.

Return ONLY valid JSON matching the exact schema:
{
  "reply": "Your conversational follow-up response",
  "isReadyToGenerate": boolean,
  "triggerGeneration": boolean,
  "extractedBlueprint": {
    "business": { "businessName": "", "industry": "", "description": "", "operatingHours": "", "address": "", "confirmationMethod": "", "policies": [], "targetPlatform": "", "callRecordingDisclosure": false, "proactiveAiDisclosure": false },
    "mission": { "primaryGoal": "", "supportedIntents": [], "requiredInformation": [] },
    "personality": { "tone": "" },
    "conversation": { "opening": "", "faqCards": [{ "question": "", "answer": "" }] },
    "overrides": { "faqPairs": [{ "question": "", "answer": "" }], "transferRules": [{ "trigger": "explicit_request", "transferPhoneNumber": "", "sayBeforeTransfer": "" }] }
  },
  "missingDetails": ["request_types", "caller_segmentation", "operational_context", "data_collection", "escalation_triggers", "forbidden_actions", "faq_content", "post_call_action"]
}`;

    const res = await this.generateJson<BuilderChatTurnResponse>(prompt);
    if (!res || !res.reply) {
      return {
        reply: "Thank you for sharing those details! Walk me through a perfect call from start to finish — what information does the agent gather along the way?",
        isReadyToGenerate: false,
        triggerGeneration: false,
        extractedBlueprint: currentBlueprint,
        missingDetails: ["request_types", "caller_segmentation", "operational_context", "data_collection", "escalation_triggers", "forbidden_actions", "faq_content", "post_call_action"]
      };
    }
    return res;
  }
}
