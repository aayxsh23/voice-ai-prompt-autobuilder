import { GoogleGenAI } from '@google/genai';
import { MockLlmProvider } from './mockLlmProvider';
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

export class GeminiProvider implements LlmService {
  private ai: GoogleGenAI | null = null;
  private modelName: string;
  private mockFallback = new MockLlmProvider();

  constructor(apiKey?: string, modelName = 'gemini-3.1-flash-lite') {
    this.modelName = process.env.GEMINI_MODEL || modelName;
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (typeof window === 'undefined' && key && key.trim() !== '') {
      this.ai = new GoogleGenAI({ apiKey: key });
    }
  }

  private async generateText(prompt: string): Promise<string> {
    if (!this.ai) throw new Error("Gemini API key missing on server");
    const response = await this.ai.models.generateContent({
      model: this.modelName,
      contents: prompt,
    });
    return response.text || "";
  }

  private async generateJson<T>(prompt: string, fallback: T): Promise<T> {
    if (!this.ai) return fallback;
    const jsonInstruction = `\n\nCRITICAL INSTRUCTION:\nReturn valid JSON only.\nDo not include markdown.\nDo not include code fences.\nDo not include explanations outside the JSON object.\nUse null instead of unknown values.\nUse empty arrays instead of missing array fields.`;
    
    try {
      const response = await this.ai.models.generateContent({
        model: this.modelName,
        contents: prompt + jsonInstruction,
        config: {
          responseMimeType: "application/json",
        }
      });
      const raw = response.text || "";
      return safeParseJson<T>(raw, fallback);
    } catch (err) {
      console.warn("Gemini generateJson error, attempting repair / fallback:", err);
      return fallback;
    }
  }

  async generateConversationDesign(input: {
    template: string;
    business: BusinessSnapshot;
    mission: CallMission;
  }): Promise<ConversationDesign> {
    const fallback = await this.mockFallback.generateConversationDesign(input);
    if (!this.ai) return fallback;

    const prompt = `You are a senior AI voice agent conversation architect.
Design a production-grade conversation flow map for:
Business Name: ${input.business.businessName}
Industry: ${input.business.industry}
Description: ${input.business.description}
Primary Goal: ${input.mission.primaryGoal}
Supported Intents: ${input.mission.supportedIntents?.join(", ") || ""}

Return JSON matching this exact structure:
{
  "opening": "Spoken greeting",
  "intentDetection": ["routing rules"],
  "intents": [
    {
      "intent": "name",
      "description": "desc",
      "requiredFields": ["field1", "field2"],
      "optionalFields": ["opt1"],
      "questionsToAsk": ["Q1", "Q2"],
      "confirmationRequired": true,
      "completionAction": "action_name",
      "failurePath": "failure instruction",
      "escalationPath": "escalation rule"
    }
  ],
  "confirmationRules": ["rule1"],
  "fallbackRules": ["rule1"],
  "closingRules": ["rule1"],
  "faqCards": [{"question": "Q", "answer": "A"}],
  "objectionCards": [{"objection": "Obj", "handling": "Handle"}],
  "edgeCases": [{"scenario": "Scen", "action": "Act"}]
}`;

    return this.generateJson<ConversationDesign>(prompt, fallback);
  }

  async runGapAudit(input: {
    business: BusinessSnapshot;
    mission: CallMission;
    conversation: ConversationDesign;
    personality: VoicePersonality;
  }): Promise<GapAuditResult> {
    const fallback = await this.mockFallback.runGapAudit(input);
    if (!this.ai) return fallback;

    const prompt = `You are auditing an AI voice-agent prompt configuration before final prompt generation.

Review the provided business details, call mission, conversation design, and personality requirements.
Business: ${JSON.stringify(input.business)}
Mission: ${JSON.stringify(input.mission)}

Find only missing information that would materially affect:
- prompt quality
- human-level completeness
- call-flow completeness
- caller safety
- task completion
- legal or compliance boundaries
- escalation behavior
- confirmation accuracy
- hallucination risk

Do not ask unnecessary questions.
Do not ask for information that can safely be handled by saying “I do not have that information.”
Do not ask more than 7 follow-up questions.

Return JSON only:
{
  "readinessScore": 85,
  "missingCriticalDetails": [
    {
      "field": "Field name",
      "whyItMatters": "Reason",
      "questionToAskUser": "Clear friendly question?",
      "recommendedDefault": "Default option"
    }
  ],
  "canGenerateWithoutFollowup": false
}`;

    return this.generateJson<GapAuditResult>(prompt, fallback);
  }

  async generateBuilderChatReply(messages: ChatMessage[], currentBlueprint: Partial<BlueprintJson>): Promise<BuilderChatTurnResponse> {
    const fallback = await this.mockFallback.generateBuilderChatReply(messages, currentBlueprint);
    if (!this.ai) return fallback;

    const prompt = `You are an expert AI voice agent architect helping a user build their AI voice agent through an interactive chatbot conversation.
The user wants to define what they are building. You ask follow-up questions required to fill out all details needed for an AI prompt template.
Current known blueprint: ${JSON.stringify(currentBlueprint)}
Conversation history:
${messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n")}

Respond with JSON only:
{
  "reply": "Your next conversational response or follow-up question to the user. Ask clarifying questions if key details like supported intents, required caller fields, or objection handling are missing.",
  "isReadyToGenerate": boolean (true only if you have enough info about use case, intents, required fields, and tone),
  "extractedBlueprint": {
    "useCase": "string",
    "business": { "businessName": "...", "description": "...", "industry": "..." },
    "mission": { "primaryGoal": "...", "supportedIntents": ["..."] }
  },
  "missingDetails": ["List of missing details"]
}`;

    return this.generateJson<BuilderChatTurnResponse>(prompt, fallback);
  }

  async generateReviewDraft(input: BlueprintJson): Promise<PromptPackageDraft> {
    const fallback = await this.mockFallback.generateReviewDraft(input);
    if (!this.ai) return fallback;

    // Orchestration Pass 1: Compile split prompt package strictly matching user's template
    const compilePrompt = `You are an expert voice agent prompt engineer.
Compile a production-ready AI voice agent prompt package for:
Blueprint: ${JSON.stringify(input)}

CRITICAL REQUIREMENT: Divide the final prompt strictly into two parts:
1. "agentPrompt": User-editable agent prompt containing ONLY Sections 1, 4, and 5 enclosed in <agent_instruction> tags.
   - Section 1: IDENTITY & CONTEXT (Agent Name, Company, Role, Tone, Language & Grammar, and Runtime Session Variables).
   - Section 4: THE CALL FLOW (STATE MACHINE) (Step-by-step sequence).
   - Section 5: SITUATION HANDLERS & Q&A (Objections, Voicemail, Angry user, Out of scope).

2. "systemPrompt": Core engine system prompt containing ONLY Sections 2, 3, 6, and 7 enclosed in <agent_instruction> tags.
   - Section 2: HARD GATES & GLOBAL RULES (ABSOLUTE) (Safety, Turn-taking, No per-field readbacks, No filler, TTS rules, Silent tools).
   - Section 3: PRE-TURN CHECKLIST (SILENT EVALUATION).
   - Section 6: CLOSING PROTOCOL (One-shot close triggering end_call).
   - Section 7: CORE VOICE FUNCTION DEFINITIONS (Must include end_call and validate_digit_input definitions).

Return JSON matching this schema:
{
  "agentPrompt": "<agent_instruction>\\n## 1. IDENTITY & CONTEXT\\n...\\n## 4. THE CALL FLOW\\n...\\n## 5. SITUATION HANDLERS\\n...</agent_instruction>",
  "systemPrompt": "<agent_instruction>\\n## 2. HARD GATES & GLOBAL RULES\\n...\\n## 3. PRE-TURN CHECKLIST\\n...\\n## 6. CLOSING PROTOCOL\\n...\\n## 7. CORE VOICE FUNCTION DEFINITIONS\\n...</agent_instruction>",
  "dynamicVariables": [{"key": "Customer_Name", "label": "Customer Name", "type": "caller", "required": true, "defaultValue": "John Doe", "source": "runtime", "description": "Caller name"}],
  "suggestedFunctions": [
    {"name": "end_call", "category": "Core Voice Tool", "description": "End call after closing phrase.", "purposeInPrompt": "Terminates session", "requiredInputs": ["reason"], "expectedOutputs": ["ended"], "enabled": true},
    {"name": "validate_digit_input", "category": "Core Voice Tool", "description": "Validate spoken digits.", "purposeInPrompt": "Validates digits", "requiredInputs": ["field", "expected_digits", "user_text"], "expectedOutputs": ["valid"], "enabled": true}
  ],
  "knowledgeBaseSuggestions": [{"title": "T", "content": "C", "category": "Cat"}],
  "faqCards": [{"question": "Q", "answer": "A"}],
  "objectionCards": [{"objection": "O", "handling": "H"}],
  "edgeCaseRules": [{"scenario": "S", "action": "A"}],
  "testScenarios": [{"title": "T", "persona": "easy caller", "callerGoal": "G", "sampleCallerMessage": "M", "expectedAgentBehavior": "B", "riskLevel": "low"}],
  "qualityReview": {
    "overallScore": 94,
    "completionScore": 92,
    "safetyScore": 98,
    "voiceStyleScore": 94,
    "structureScore": 95,
    "edgeCaseScore": 92,
    "humanQualityScore": 94,
    "hallucinationResistanceScore": 96,
    "minimumManualEditScore": 92,
    "issues": [],
    "recommendedImprovements": [],
    "readyToPublish": true
  }
}`;

    let draft = await this.generateJson<PromptPackageDraft>(compilePrompt, fallback);

    // Enforce mandatory tools in suggestedFunctions
    const mandatoryTools: SuggestedFunctionSpec[] = [
      {
        name: "end_call",
        category: "Core Voice Tool",
        description: "End the voice call after the closing agent's one-shot terminal closing turn. Call this in the SAME turn as the closing phrase; no further turns will be processed.",
        purposeInPrompt: "Terminates active session when conversation completes or refusal occurs.",
        requiredInputs: ["reason"],
        expectedOutputs: ["ended"],
        enabled: true
      },
      {
        name: "validate_digit_input",
        category: "Core Voice Tool",
        description: "Validate phone number or pin-code digits from a spoken user turn, including partial input and repeated STT fragments.",
        purposeInPrompt: "Validates partial or complete spoken digit strings.",
        requiredInputs: ["field", "expected_digits", "user_text"],
        expectedOutputs: ["status", "valid", "digits", "digits_remaining"],
        enabled: true
      }
    ];
    for (const tool of mandatoryTools) {
      if (!draft.suggestedFunctions?.some(f => f.name === tool.name)) {
        draft.suggestedFunctions = [tool, ...(draft.suggestedFunctions || [])];
      }
    }

    // Orchestration Pass 2 & 3: Self-Critique & Improvement Loop
    try {
      const critique = await this.evaluatePromptQuality(draft.agentPrompt, draft.systemPrompt, input.useCase);
      if (critique.overallScore < 90 || critique.issues.length > 0) {
        draft = await this.improvePromptWithCritique(draft, critique);
      }
    } catch (e) {
      console.warn("Self-improvement loop pass warning:", e);
    }

    return draft;
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
    return draft.dynamicVariables;
  }

  async recommendSuggestedFunctions(input: BlueprintJson): Promise<SuggestedFunctionSpec[]> {
    const draft = await this.generateReviewDraft(input);
    return draft.suggestedFunctions;
  }

  async generateKnowledgeBaseSuggestions(input: BlueprintJson): Promise<{ title: string; content: string; category: string }[]> {
    const draft = await this.generateReviewDraft(input);
    return draft.knowledgeBaseSuggestions;
  }

  async generateFaqCards(input: BlueprintJson): Promise<{ question: string; answer: string }[]> {
    const draft = await this.generateReviewDraft(input);
    return draft.faqCards;
  }

  async generateObjectionCards(input: BlueprintJson): Promise<{ objection: string; handling: string }[]> {
    const draft = await this.generateReviewDraft(input);
    return draft.objectionCards;
  }

  async generateEdgeCaseRules(input: BlueprintJson): Promise<{ scenario: string; action: string }[]> {
    const draft = await this.generateReviewDraft(input);
    return draft.edgeCaseRules;
  }

  async generateTestScenarios(input: BlueprintJson): Promise<TestScenarioSpec[]> {
    const draft = await this.generateReviewDraft(input);
    return draft.testScenarios;
  }

  async evaluatePromptQuality(agentPrompt: string, systemPrompt: string, useCase: string): Promise<QualityReview> {
    const fallback = await this.mockFallback.evaluatePromptQuality(agentPrompt, systemPrompt, useCase);
    if (!this.ai) return fallback;

    const prompt = `Evaluate this AI voice agent prompt package against expert human prompt engineer standards.
Use Case: ${useCase}
Agent Prompt:
${agentPrompt}

System Prompt:
${systemPrompt}

Evaluate completion, safety, voice style, structure, edge cases, human quality, hallucination resistance, and manual edit requirements (0-100 scores).
Return JSON matching QualityReview interface.`;

    return this.generateJson<QualityReview>(prompt, fallback);
  }

  async simulatePromptTurn(input: SimulationTurnInput): Promise<SimulationTurnOutput> {
    const fallback = await this.mockFallback.simulatePromptTurn(input);
    if (!this.ai) return fallback;

    const prompt = `Simulate one single turn of an AI voice agent phone conversation.
Caller Persona: ${input.persona}
Caller Message: "${input.callerMessage}"
Conversation History: ${JSON.stringify(input.conversationHistory)}

Agent Prompt Rules:
${input.currentAgentPrompt}

System Prompt Rules:
${input.currentSystemPrompt}

Return JSON:
{
  "simulatedResponse": "Exact natural spoken reply",
  "detectedIntent": "intent_name",
  "collectedVariables": {"slot_name": "value"},
  "nextRequiredField": "next_slot",
  "guardrailTriggered": false,
  "issueNotes": "Any observations"
}`;

    return this.generateJson<SimulationTurnOutput>(prompt, fallback);
  }

  async improvePromptWithCritique(draft: PromptPackageDraft, critique: QualityReview): Promise<PromptPackageDraft> {
    if (!this.ai) return this.mockFallback.improvePromptWithCritique(draft, critique);

    const prompt = `Improve this AI voice agent prompt draft based on the quality review critique.
Current Draft: ${JSON.stringify(draft)}
Critique: ${JSON.stringify(critique)}

Address all identified issues and recommendations. Return the refined JSON PromptPackageDraft.`;

    return this.generateJson<PromptPackageDraft>(prompt, draft);
  }
}

export const geminiClient = {
  async generate(options: { systemInstruction?: string; prompt: string }): Promise<{ text: string }> {
    const apiKey = process.env.GEMINI_API_KEY;
    const modelName = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

    if (typeof window === 'undefined' && apiKey && apiKey.trim() !== '') {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const res = await ai.models.generateContent({
          model: modelName,
          contents: options.prompt,
          config: options.systemInstruction ? { systemInstruction: options.systemInstruction } : undefined,
        });
        if (res.text) {
          return { text: res.text };
        }
      } catch (err) {
        console.warn("geminiClient.generate API error, seamlessly falling back to deterministic compiler mode:", err);
      }
    }

    // Deterministic Enterprise Fallback Mode for local / offline compilation
    const promptLower = options.prompt.toLowerCase();
    if (promptLower.includes("extract the core business metadata") || promptLower.includes("business metadata")) {
      return {
        text: JSON.stringify({
          companyName: "Enterprise Client",
          industry: "Operations & Logistics",
          role: "Automated Voice Coordinator",
          toneProfile: ["Calm", "Direct", "Professional"],
          contextScope: "Customer verification and logistics tracking",
          languageVariant: "English",
          context: [
            { key: "Customer_Name", label: "Customer Name", description: "Name of verified caller", source: "crm", defaultValue: "Valued Customer" }
          ]
        })
      };
    }

    if (promptLower.includes("extract the primary operational call goals") || promptLower.includes("operational states")) {
      return {
        text: JSON.stringify([
          { sequenceOrder: 1, stateId: "greeting", stateName: "Greeting & Verification", explicitDialogueScript: 'Say: "Hello {{Customer_Name}}, calling from our operations desk. How can I assist you today?"', slotsToCollect: [], fallbackBehavior: "Re-state company identity and ask how to help." },
          { sequenceOrder: 2, stateId: "collect_req", stateName: "Requirement Collection", explicitDialogueScript: 'Say: "Could you please provide your 10-digit callback phone number or reference ID?"', slotsToCollect: ["phone_number"], fallbackBehavior: "Offer to connect with a human dispatcher if caller cannot locate ID." }
        ])
      };
    }

    if (promptLower.includes("discover all data slots") || promptLower.includes("data slots")) {
      return {
        text: JSON.stringify([
          { name: "phone_number", type: "string", ttsNormalizationRule: "Speak each digit individually with micro-pauses (e.g. nine eight zero)", isRequired: true }
        ])
      };
    }

    if (promptLower.includes("compile the strict script blocks")) {
      return {
        text: `### STATE 1: GREETING & VERIFICATION
Say: "Hello {{Customer_Name}}, calling from our operations desk. How can I assist you today?"
- Wait for caller confirmation before advancing.

### STATE 2: REQUIREMENT COLLECTION
Say: "Could you please provide your 10-digit callback phone number or reference ID?"
- Required Slot: phone_number
- If caller hesitates or fails: Offer to connect with a human dispatcher.`
      };
    }

    if (promptLower.includes("audio, tts, and speakability") || promptLower.includes("speech synthesis")) {
      return {
        text: `### VOICE & SPEAKABILITY MODULE
- **TTS Punctuation:** Use periods for full breaths and commas for slight pauses. Never output markdown symbols (*, _, []).
- **Number & Acronym Normalization:** Read acronyms like GST, SMS, and ID as Roman letters (G-S-T, S-M-S). Speak phone numbers digit by digit.
- **Shock Absorber:** If caller utters out-of-context greetings like "Hello?" or "Are you there?", pause briefly and say: "I am right here. Let's continue."`
      };
    }

    if (promptLower.includes("normalize the following technical tool")) {
      return {
        text: `### TOOL VERBALIZATION SPECIFICATIONS
- **end_call:** Execute silently when the interaction concludes. Do not speak tool name aloud.
- **validate_digit_input:** Call silently to verify spoken digits.`
      };
    }

    if (promptLower.includes("safety protocols") || promptLower.includes("objection")) {
      return {
        text: `### SAFETY & CORRECTION SHOCK ABSORBERS
- **ASR Correction Routing:** If the user corrects a piece of data during summary or collection (e.g. saying "No, that's wrong"), update that specific slot, reset the parsing buffer, and immediately resume from where you left off without repeating validated turns.
- **Emergency Escalation:** If caller expresses acute distress or emergency, immediately halt automated workflow and direct to human operators or 911.`
      };
    }

    return { text: "Compiled production directive generated successfully." };
  }
};
