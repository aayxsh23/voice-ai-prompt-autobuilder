// lib/llm/geminiProvider.ts
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

// Fail fast if the environment is not configured
if (!process.env.GEMINI_API_KEY) {
  throw new Error("FATAL: GEMINI_API_KEY is missing. The compiler cannot run.");
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const COMPILER_GENERATION_CONFIG = {
  temperature: 0.1, // Near-zero for deterministic script generation
  topP: 0.4,
  topK: 20,
};

export const GLOBAL_COMPILER_INSTRUCTION = `
You are a headless, stateless Enterprise Voice AI Compiler Node.
Your exclusive function is to output strict, production-ready Voice AI Markdown sub-routines.
NO PROSE. RAW OUTPUT ONLY. VOICE-FIRST SYNTAX STRICTLY ENFORCED.
`;

export const geminiClient = {
  async generate({ systemInstruction, prompt }: { systemInstruction: string, prompt: string }) {
    const combinedInstruction = `${GLOBAL_COMPILER_INSTRUCTION}\n\nSPECIFIC TASK:\n${systemInstruction}`;

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: combinedInstruction,
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

  constructor(apiKey?: string, modelName = 'gemini-2.5-flash') {
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

  async generateConversationDesign(input: { template: string; business: BusinessSnapshot; mission: CallMission }): Promise<ConversationDesign> {
    const prompt = `Design a production-grade conversation flow map for: ${JSON.stringify(input)}. Return JSON matching ConversationDesign.`;
    return this.generateJson<ConversationDesign>(prompt);
  }

  async runGapAudit(input: { business: BusinessSnapshot; mission: CallMission; conversation: ConversationDesign; personality: VoicePersonality }): Promise<GapAuditResult> {
    const prompt = `Audit this voice agent configuration: ${JSON.stringify(input)}. Return JSON matching GapAuditResult.`;
    return this.generateJson<GapAuditResult>(prompt);
  }

  async generateReviewDraft(input: BlueprintJson): Promise<PromptPackageDraft> {
    const compilePrompt = `Compile a production-ready AI voice agent prompt package for: ${JSON.stringify(input)}.
Return JSON matching PromptPackageDraft schema including agentPrompt, systemPrompt, dynamicVariables, suggestedFunctions, knowledgeBaseSuggestions, faqCards, objectionCards, edgeCaseRules, testScenarios, and qualityReview.`;
    return this.generateJson<PromptPackageDraft>(compilePrompt);
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

  async generateObjectionCards(input: BlueprintJson): Promise<{ objection: string; handling: string }[]> {
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
