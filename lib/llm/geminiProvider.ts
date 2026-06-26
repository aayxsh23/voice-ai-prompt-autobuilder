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

  async generateReviewDraft(input: BlueprintJson): Promise<PromptPackageDraft> {
    const fallback = await this.mockFallback.generateReviewDraft(input);
    if (!this.ai) return fallback;

    // Orchestration Pass 1: Compile initial package
    const compilePrompt = `You are an expert voice agent prompt engineer.
Compile a production-ready AI voice agent prompt package for:
Blueprint: ${JSON.stringify(input)}

Create a detailed business Agent Prompt and a reusable platform System Prompt.
The output must feel human-written, avoiding filler, robotic phrasing, and hallucinations.

Return JSON matching this schema:
{
  "agentPrompt": "# VOICE AGENT BLUEPRINT\\n...",
  "systemPrompt": "You are a real-time AI voice agent...",
  "dynamicVariables": [{"key": "key", "label": "label", "type": "business", "required": true, "defaultValue": "val", "source": "static", "description": "desc"}],
  "suggestedFunctions": [{"name": "fn", "category": "cat", "description": "desc", "purposeInPrompt": "purp", "requiredInputs": ["in"], "expectedOutputs": ["out"], "enabled": true}],
  "knowledgeBaseSuggestions": [{"title": "T", "content": "C", "category": "Cat"}],
  "faqCards": [{"question": "Q", "answer": "A"}],
  "objectionCards": [{"objection": "O", "handling": "H"}],
  "edgeCaseRules": [{"scenario": "S", "action": "A"}],
  "testScenarios": [{"title": "T", "persona": "easy caller", "callerGoal": "G", "sampleCallerMessage": "M", "expectedAgentBehavior": "B", "riskLevel": "low"}],
  "qualityReview": {
    "overallScore": 90,
    "completionScore": 88,
    "safetyScore": 95,
    "voiceStyleScore": 90,
    "structureScore": 88,
    "edgeCaseScore": 89,
    "humanQualityScore": 91,
    "hallucinationResistanceScore": 93,
    "minimumManualEditScore": 90,
    "issues": [],
    "recommendedImprovements": [],
    "readyToPublish": true
  }
}`;

    let draft = await this.generateJson<PromptPackageDraft>(compilePrompt, fallback);

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
