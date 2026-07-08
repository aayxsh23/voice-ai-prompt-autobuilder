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
### AGENT IDENTITY & PERSONA
### LANGUAGE HANDLING
### OUTPUT & VOICE MECHANICS
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

export const geminiClient = {
  async generate({ systemInstruction, prompt, responseMimeType }: { systemInstruction: string, prompt: string, responseMimeType?: string }) {
    const isJson = responseMimeType === "application/json" || systemInstruction?.toLowerCase().includes("json") || prompt?.includes("JSON");
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: isJson ? "application/json" : undefined,
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
    const isJsonRequest = prompt.includes("ONLY valid JSON") || prompt.includes("JSON matching");
    const response = await this.aiInstance.models.generateContent({
      model: this.modelName,
      contents: prompt,
      config: {
        systemInstruction: isJsonRequest
          ? "You are an expert AI voice agent architect. Output strictly valid JSON matching the schema requested without markdown formatting or code fences."
          : GLOBAL_COMPILER_INSTRUCTION,
        responseMimeType: isJsonRequest ? "application/json" : undefined,
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
    const languageMode = input.languageMode || input.business?.languageMode || (input as any).businessSpec?.meta?.languageMode || 'english';
    const capturedText = JSON.stringify((input as any).businessSpec?.capturedTopics || (input as any).capturedTopics || []) + JSON.stringify((input as any).businessSpec?.resolvedTopics || (input as any).resolvedTopics || []);
    const isHindiOrHinglish = languageMode === 'hindi' || languageMode === 'hinglish' || /hindi|hinglish/i.test(capturedText);
    const langNote = isHindiOrHinglish
      ? "\nCRITICAL LANGUAGE MANDATE (DEVANAGARI STRICT RULE):\n1. All dialogue lines ('generatedLine', 'fallbackBehavior', 'scriptDirective'), FAQ questions/answers ('question', 'answer'), and objection handling triggers/responses ('trigger', 'response') MUST be written entirely in Devanagari script (देवनागरी), NOT Romanized/English letters.\n2. NEVER write common Hindi words ('kya', 'ho', 'hai', 'baat', 'kar', `rahi`, 'hoon', 'sir', 'maam', 'namaste', 'haan', 'nahi') or Indian names ('Deepika', 'Ananya') in English letters! Write them strictly in Devanagari ('क्या', 'हो', 'है', 'बात', 'कर', 'रही', 'हूँ', 'सर/मैम', 'नमस्ते', 'हाँ', `नहीं`, 'दीपिका', 'अनन्या').\n3. ONLY specific technical/domain software keywords (like 'Marg ERP', 'business owner', 'online demo', 'software', 'accounting', 'inventory', 'billing', 'pincode', 'team', 'office', 'schedule') can remain in English characters inside the Devanagari sentence.\n4. Do NOT output duplicate questions/objections — never output both a Romanized and a Devanagari version of the same FAQ or objection. Output ONLY the Devanagari version."
      : languageMode === 'multilingual'
      ? "\nCRITICAL LANGUAGE MANDATE: Support English, Hindi, and Hinglish. When generating Hindi sentences in dialogue, FAQ answers, or objection responses, they MUST be written in Devanagari script (देवनागरी), not Roman script."
      : "";
    const CALL_FLOW_PLAN_SCHEMA = `{"agentName":"string","primaryGoal":"string","steps":[{"stepNumber":"number","label":"string","condition":"string","collectsVariable":"string|null","generatedLine":"string","branchingConditions":[{"condition":"string","goToStep":"number|'end_call'|'transfer'"}],"fallbackBehavior":"string","maxRetries":3}],"emergencyTriggers":["string"],"outOfScopeTopics":["string"]}`;
    const pass1Prompt = `You are a voice agent call flow architect. Design logical state transitions.
Output ONLY valid JSON matching:\n${CALL_FLOW_PLAN_SCHEMA}

MANDATORY RULES FOR CALL FLOW GENERATION:
1. MULTI-REQUEST ROUTING: If the business handles multiple request types, generate a ROUTE BY REQUEST TYPE step with sub-flows for each intent.
2. CONFIRMATION READ-BACK: The second-to-last step MUST be a CONFIRM ALL DETAILS step that reads back every collected variable using {{variable_name}} syntax.
3. FALLBACK DIALOGUE: Every fallbackBehavior MUST be written as exact spoken dialogue starting with Say:.
4. RETRY LIMITS: Each step that collects information must include maxRetries: 3.
5. EDGE-CASE BRANCHES: Generate branches for: silence timeout, past dates, caller upset/frustrated, mid-flow transfer request, audio dropout.${langNote}

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

FAQ GENERATION RULE: Generate 8-12 FAQ entries based on the business context. For each operational fact (hours, address, policies), create a Q&A entry. For UNKNOWN facts, generate deflection answers. Never generate "No FAQs defined." Always generate contextual entries.${langNote}

GUARDRAIL GENERATION RULES:
1. Generate 5-8 guardrails specific to THIS exact business.
2. Each guardrail must be ENFORCEABLE with specific sub-cases.
3. Include at least 2 BEHAVIORAL guardrails (what to DO, not just prohibitions).
4. Include an INVENTION prohibition specific to this business.

VARIABLE CLASSIFICATION RULE:
1. INFIELDS (Pre-Call Context): An infield can NEVER be an extraction (i.e., inside 'collectsVariable' or collected during call flow). Furthermore, you CANNOT create or invent any infields on your own — infields MUST be explicitly specified by the user as pre-call context. If the user did not explicitly specify any pre-call variables, set ZERO infields.
2. OUTFIELDS (Post-Call Extraction): All details collected or extracted from the conversation transcript ('collectsVariable', 'interest_status', 'demo_type', 'pincode') MUST be marked as 'fieldDirection: "outfield"' and referenced with '[variable_name]' syntax in extractions.

SystemPrompt must follow plan:\n${JSON.stringify(plan, null, 2)}\nContext:\n${JSON.stringify(llmInput, null, 2)}`;
    const pass2Raw = await this.generateRaw(pass2Prompt);
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
    draft.callFlowSteps = Array.isArray(plan.steps) ? plan.steps : [];
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
    const prompt = `Simulate one single turn of voice agent phone conversation: ${JSON.stringify(input)}. Return JSON matching SimulationTurnOutput.`;
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
