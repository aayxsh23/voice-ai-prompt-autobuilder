
import type { JudgeReport, JudgeIssue } from "../pipeline/judge/types";
export type { JudgeReport, JudgeIssue };

export interface BusinessSnapshot {
  businessName?: string;
  companyName?: string;
  languageMode?: 'english' | 'hindi' | 'hinglish' | 'multilingual';
  valueProposition?: string;
  industry?: string;
  location?: string;
  description?: string;
  services?: string[];
  callerTypes?: string[];
  conversationDirection?: 'inbound' | 'outbound' | 'both' | string;
  operatingHours?: string;
  address?: string;
  confirmationMethod?: string;
  policies?: string[];
  targetPlatform?: 'bland' | 'retell' | 'vapi' | 'generic' | string;
  silencePreferences?: string;
  bargeInPreferences?: string;
  callRecordingDisclosure?: boolean;
  proactiveAiDisclosure?: boolean;
  languageStyle?: string;
  sensitiveTopics?: string[];
  restrictedClaims?: string[];
  complianceNotes?: string;
}

export interface TransferCondition {
  trigger: 'explicit_request' | 'intent_fail_count' | 'frustration_signal' | 'out_of_scope';
  threshold?: number;
  transferPhoneNumber: string;
  transferDepartment?: string;
  sayBeforeTransfer: string;
}

export interface SchemaOverrides {
  faqPairs?: Array<{ question: string; answer: string }>;
  objectionPairs?: Array<{ trigger?: string; response?: string; objection?: string; handling?: string }>;
  verbatimLines?: Array<{ stepLabel: string; exactLine: string }>;
  transferRules?: TransferCondition[];
}

export interface CallMission {
  primaryGoal?: string;
  supportedIntents?: string[];
  successCriteria?: string[];
  requiredInformation?: string[];
  allowedActions?: string[];
  confirmationRequiredFor?: string[];
  escalationTriggers?: string[];
  refusalRules?: string[];
  closingExpectations?: string[];
  transferPhoneNumber?: string;
  transferConditions?: TransferCondition[];
}

export interface IntentDesign {
  intent: string;
  description: string;
  requiredFields: string[];
  optionalFields: string[];
  questionsToAsk: string[];
  confirmationRequired: boolean;
  completionAction: string;
  failurePath: string;
  escalationPath: string;
}

export interface ConversationDesign {
  opening?: string;
  intentDetection?: string[];
  intents?: IntentDesign[];
  confirmationRules?: string[];
  fallbackRules?: string[];
  closingRules?: string[];
  faqCards?: { question: string; answer: string }[];
  objectionCards?: { objection: string; handling: string }[];
  edgeCases?: { scenario: string; action: string }[];
}

export interface VoicePersonality {
  gender?: string;
  tone?: string;
  sentenceStyle?: 'short' | 'moderate' | 'detailed' | string;
  humorAllowed?: boolean;
  phrasesToUse?: string[];
  phrasesToAvoid?: string[];
  aiDisclosureStyle?: string;
}

export interface GapAuditResult {
  readinessScore: number;
  missingCriticalDetails: {
    field: string;
    whyItMatters: string;
    questionToAskUser: string;
    recommendedDefault: string;
  }[];
  canGenerateWithoutFollowup: boolean;
}

export interface DynamicVariableSpec {
  key: string;
  label: string;
  type: 'business' | 'caller' | 'task' | 'tool_output' | 'runtime' | 'static';
  fieldDirection?: 'infield' | 'outfield';
  required: boolean;
  defaultValue: string;
  source: string;
  description: string;
}

export interface SuggestedFunctionSpec {
  name: string;
  category: string;
  description: string;
  purposeInPrompt: string;
  requiredInputs: string[];
  expectedOutputs: string[];
  enabled: boolean;
  /** Full JSON Schema for the tool's arguments, as produced by ToolPlanner. This is
   *  what gets registered with the telephony platform, so the prompt does not need
   *  to redeclare tool definitions. */
  parameters?: Record<string, unknown>;
}

export interface QualityReview {
  overallScore: number;
  completionScore: number;
  safetyScore: number;
  voiceStyleScore: number;
  structureScore: number;
  edgeCaseScore: number;
  humanQualityScore: number;
  hallucinationResistanceScore: number;
  minimumManualEditScore: number;
  issues: {
    severity: 'low' | 'medium' | 'high' | 'critical';
    issue: string;
    fix: string;
  }[];
  recommendedImprovements: string[];
  readyToPublish: boolean;
}

export interface TestScenarioSpec {
  title: string;
  persona: string;
  callerGoal: string;
  sampleCallerMessage: string;
  expectedAgentBehavior: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface PromptPackageDraft {
  finalPrompt: string;
  businessSpec?: BusinessSpecification;
  agentPrompt?: string;
  systemPrompt?: string;
  dynamicVariables: DynamicVariableSpec[];
  suggestedFunctions: SuggestedFunctionSpec[];
  knowledgeBaseSuggestions: { title: string; content: string; category: string }[];
  faqCards: { question: string; answer: string }[];
  objectionCards: Array<{ trigger?: string; response?: string; objection?: string; handling?: string }>;
  edgeCaseRules: { scenario: string; action: string }[];
  testScenarios: TestScenarioSpec[];
  qualityReview: QualityReview;
  primaryGoal?: string;
  languageMode?: string;
  verbatimLines?: { stepLabel: string; exactLine: string }[];
  transferConditions?: TransferCondition[];
  callFlowScript?: string;
  callFlowSteps?: any[];
  emergencyTriggers?: string[];
  outOfScopeTopics?: string[];
  guardrails?: {
    emergencyTriggers?: string[];
    emergencyAction?: string;
    prohibitions?: string[];
  };
  optimizedGuardrails?: string;
  systemPromptCompiled?: boolean;
  operationalContext?: Record<string, string>;
  appliedRules?: any[];
  validationStatus?: 'success' | 'warning' | 'failed_review_required';
  validationErrors?: string[];
  validationWarnings?: string[];
  requiresHumanReview?: boolean;
  estimatedTokens?: number;
  languageQualityScore?: number;
  judgeReport?: JudgeReport;
}

export interface SimulationTurnInput {
  callerMessage: string;
  persona: string;
  currentAgentPrompt: string;
  currentSystemPrompt: string;
  conversationHistory: { role: 'caller' | 'agent'; content: string }[];
}

export interface SimulationTurnOutput {
  simulatedResponse: string;
  detectedIntent: string;
  collectedVariables: Record<string, string>;
  nextRequiredField: string;
  guardrailTriggered: boolean;
  issueNotes: string;
  toolCalls?: Array<{ name: string; arguments: Record<string, any> }>;
  estimatedLatencyMs?: number;
  interruptionDetected?: boolean;
  interruptionHandled?: string;
  ttsPhonetics?: string[];
}

export interface BlueprintJson {
  useCase: string;
  selectedTemplate: string;
  languageMode?: 'english' | 'hindi' | 'multilingual';
  business: BusinessSnapshot;
  mission: CallMission;
  conversation: ConversationDesign;
  personality: VoicePersonality;
  followupAnswers: Record<string, string>;
  extractedIR?: any;
  compiledSystemPrompt?: string;
  overrides?: SchemaOverrides;
}

export interface GenerateRawOptions {
  /**
   * Force JSON response mode (sets `response_format` and a JSON-oriented system
   * prompt). When omitted, JSON mode is inferred from the prompt text for backward
   * compatibility — that inference is unreliable, so any caller that needs JSON
   * should set this explicitly rather than relying on phrasing.
   */
  json?: boolean;
  /**
   * Replaces the default system prompt. Required for tasks that are not "author a new
   * voice-agent prompt" (e.g. judging or editing), since the default instructs the
   * model to emit a full prompt with a fixed section list.
   */
  systemInstruction?: string;
  contextLabel?: string;
  sessionId?: string;
}

export interface LlmService {
  generateConversationDesign(input: { template: string; business: BusinessSnapshot; mission: CallMission }): Promise<ConversationDesign>;
  runGapAudit(input: { business: BusinessSnapshot; mission: CallMission; conversation: ConversationDesign; personality: VoicePersonality }): Promise<GapAuditResult>;
  generateReviewDraft(input: BlueprintJson): Promise<PromptPackageDraft>;
  generateWithCoT?(input: BlueprintJson): Promise<PromptPackageDraft>;
  generateRaw?(prompt: string, temperature?: number, options?: GenerateRawOptions): Promise<string>;
  generateAgentPrompt(input: BlueprintJson): Promise<string>;
  generateSystemPrompt(input: BlueprintJson): Promise<string>;
  extractDynamicVariables(input: BlueprintJson): Promise<DynamicVariableSpec[]>;
  recommendSuggestedFunctions(input: BlueprintJson): Promise<SuggestedFunctionSpec[]>;
  generateKnowledgeBaseSuggestions(input: BlueprintJson): Promise<{ title: string; content: string; category: string }[]>;
  generateFaqCards(input: BlueprintJson): Promise<{ question: string; answer: string }[]>;
  generateObjectionCards(input: BlueprintJson): Promise<{ objection: string; handling: string }[]>;
  generateEdgeCaseRules(input: BlueprintJson): Promise<{ scenario: string; action: string }[]>;
  generateTestScenarios(input: BlueprintJson): Promise<TestScenarioSpec[]>;
  evaluatePromptQuality(agentPrompt: string, systemPrompt: string, useCase: string): Promise<QualityReview>;
  simulatePromptTurn(input: SimulationTurnInput): Promise<SimulationTurnOutput>;
  improvePromptWithCritique(draft: PromptPackageDraft, critique: QualityReview): Promise<PromptPackageDraft>;
  generateBuilderChatReply(messages: ChatMessage[], currentBlueprint: Partial<BlueprintJson>): Promise<BuilderChatTurnResponse>;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface BuilderChatTurnResponse {
  reply: string;
  isReadyToGenerate: boolean;
  triggerGeneration?: boolean;
  extractedBlueprint: Partial<BlueprintJson>;
  missingDetails: string[];
}

/**
 * String-aware balanced-brace scanner. Finds the first top-level JSON object/array
 * that ends at a genuine closing brace (not one inside a string literal).
 *
 * The old `substring(firstBrace, lastBrace)` fallback was defeated when a payload
 * had large string values that themselves contained braces (e.g. a Markdown `script`
 * field with `{...}` inside), because it cut on the last brace anywhere — including
 * one inside a string.
 */
function extractBalancedJson(src: string): string | null {
  const openers: Array<'{' | '['> = [];
  const matches: Record<'{' | '[', '}' | ']'> = { '{': '}', '[': ']' };
  let start = -1;
  let inString = false;
  let escape = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{' || ch === '[') {
      if (openers.length === 0) start = i;
      openers.push(ch);
      continue;
    }
    if (ch === '}' || ch === ']') {
      const opener = openers.pop();
      if (!opener || matches[opener] !== ch) return null; // malformed
      if (openers.length === 0 && start !== -1) return src.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Light JSON repair pass: escape raw newlines/tabs/carriage-returns inside string
 * literals (LLMs frequently emit multi-line string values unescaped), strip trailing
 * commas before `}` / `]`. Not a full parser — just the two failure modes seen in
 * practice.
 */
function repairJsonLite(src: string): string {
  let out = '';
  let inString = false;
  let escape = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inString) {
      if (escape) { out += ch; escape = false; continue; }
      if (ch === '\\') { out += ch; escape = true; continue; }
      if (ch === '"') { out += ch; inString = false; continue; }
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') { out += '\\r'; continue; }
      if (ch === '\t') { out += '\\t'; continue; }
      out += ch;
      continue;
    }
    if (ch === '"') { out += ch; inString = true; continue; }
    if (ch === ',') {
      // Skip trailing commas before `}` or `]` (whitespace tolerated).
      let j = i + 1;
      while (j < src.length && /\s/.test(src[j])) j++;
      if (src[j] === '}' || src[j] === ']') continue;
    }
    out += ch;
  }
  return out;
}

export function safeParseJson<T>(raw: string, fallback: T): T {
  const cleanedRaw = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  try {
    let cleaned = cleanedRaw;
    // Strip markdown fences if present anywhere
    const fenceJsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenceJsonMatch && fenceJsonMatch[1]) {
      cleaned = fenceJsonMatch[1].trim();
    } else {
      if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
      else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
      if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();
    return JSON.parse(cleaned) as T;
  } catch (error) {
    // 1) String-aware balanced-brace extraction.
    const extracted = extractBalancedJson(cleanedRaw);
    if (extracted !== null) {
      try { return JSON.parse(extracted) as T; } catch {}
      // 2) Light repair on the extracted region.
      try { return JSON.parse(repairJsonLite(extracted)) as T; } catch {}
    }
    // 3) Light repair over the whole payload as a final attempt.
    try { return JSON.parse(repairJsonLite(cleanedRaw)) as T; } catch {}

    if (process.env.NODE_ENV !== 'production') {
      console.warn('safeParseJson failed, returning fallback:', error);
    }
    return fallback;
  }
}

export * from './types/CallFlowPlan';

export interface BusinessSpecification {
  meta: {
    companyName: string;
    agentName: string;
    industry: string;
    isRegulated: boolean;
    toneProfile: string[];
    primaryGoal: string;
    languageMode?: 'english' | 'hindi' | 'hinglish' | 'multilingual';
    callDirection?: 'inbound' | 'outbound' | 'both';
    openingPhrase?: string;
    // Language policy (see lib/llm/language/LanguagePolicy.ts)
    agentGender?: 'female' | 'male';
    formality?: 'aap' | 'tum';
    aiDisclosure?: 'disclose' | 'deny';
    recordingDisclosure?: 'required' | 'none';
    targetTTS?: string;
    voiceCharacteristics?: { gender?: string; fillerWords?: boolean };
    scopeExclusions?: string[];
    terminalStates?: Array<{ stateId: string; label?: string; closingScript?: string }>;
    /**
     * ISO 3166-1 alpha-2 deployment region (e.g. "QA", "IN"). Gates every
     * region-specific fact (emergency numbers, phone length, currency). When absent
     * the compiler must stay generic rather than assume a default country.
     */
    region?: string;
    /**
     * Coverage-rule ids the interview established are irrelevant to THIS agent (e.g.
     * keypad fallback for a voice-only line). Lets the discovery questions adapt to
     * the use case instead of asking a fixed checklist of everyone. A mandatory floor
     * (language, safety, disclosure, goal) is never skippable — see ALWAYS_ASK.
     */
    notApplicableTopics?: string[];
    sessionId?: string;
  };
  businessSnapshot: {
    operatingHours: string | { standard?: string; exceptions?: string[] };
    exceptions?: string[];
    servicesOffered: string[];
    policies: {
      cancellation: string;
      refunds: string;
      escalationNumbers: string[];
      disclosures?: string[];
      otherPolicies?: string[];
    };
  };
  callFlowPlan: {
    userDefinedSteps?: Array<{
      sequenceOrder?: number;
      stateId: string;
      stateName?: string;
      label?: string;
      objective?: string;
      scriptDirective?: string;
      slotsToCollect?: string[];
      branchingConditions?: Array<{ condition: string; goToStep: string | number | 'end_call' | 'transfer'; reason?: string }>;
      fallbackBehavior?: string;
      maxRetries?: number;
      onFailure?: { afterRetries?: number; action?: string; target?: string; fallbackLine?: string };
      confirmationRequired?: boolean;
      digressionAllowed?: boolean;
      isTerminal?: boolean;
    }>;
    entryRouting?: Array<{ trigger: string; goToStep: string | number }>;

    interruptionPolicy?: string;
    digressionPolicy?: string;
    confirmationStyle?: string;
    dtmfFallback?: { enabled?: boolean; triggerAfterFailures?: number };
    closingScript?: string;
    /** What to do once a slot hits its retry limit (e.g. wrap up vs transfer). */
    retryExhaustion?: { afterRetries?: number; action?: string };
    /**
     * The ordered call-flow stages the USER described, extracted from the interview.
     * The planner must produce a state per stage. Never synthesized — when the user
     * described no stages this stays undefined, because a generic stage list would
     * just be another hardcoded template.
     */
    requiredStages?: Array<{ id: string; label: string }>;
    script?: string;
    steps?: Array<{
      sequenceOrder: number;
      stateId: string;
      stateName: string;
      objective?: string;
      /**
       * LITERAL SPEECH ONLY — rendered into the prompt as the agent's spoken line.
       * Never put builder instructions here; they get read aloud to the caller.
       * Use `behaviorDirective` for anything the agent should do but not say.
       */
      scriptDirective: string;
      /** Non-spoken instructions for this state (routing intent, handling notes). */
      behaviorDirective?: string;
      slotsToCollect: string[];
      branchingConditions?: Array<{ condition: string; goToStep: string | number | 'end_call' | 'transfer'; reason?: string }>;
      fallbackBehavior?: string;
      maxRetries?: number;
      onFailure?: { afterRetries?: number; action?: string; target?: string; fallbackLine?: string };
      confirmationRequired?: boolean;
      digressionAllowed?: boolean;
      invokesTools?: string[];
      isFallback?: boolean;
      isTerminal?: boolean;
    }>;
    fsmStates?: any[];
  };
  knowledgeBase: {
    faqs: Array<{ question: string; answer: string; isFallback?: boolean }>;
    objections: Array<{ trigger: string; response: string; isFallback?: boolean }>;
    troubleshootingSteps?: Array<{ problem: string; steps: string[] }>;
    competitorComparisons?: Array<{ competitor: string; differentiation: string }>;
  };
  tools: Array<{
    name: string;
    description: string;
    parameters: Record<string, any>;
    associatedStateId: string;
  }>;
  extractedEntities?: {
    departments: string[];
    namedContacts: Array<{ label: string; value: string }>;
    servicesOrOfferings: string[];
  };
  resolvedTopics?: string[];
  capturedTopics?: Array<{ topic: string; summary: string }>;
  dynamicVariables?: DynamicVariableSpec[];
  guardrails?: {
    injectionResistance?: string;
    disclosures?: string[];
    emergencyTriggers?: string[];
    emergencyAction?: string;
    prohibitions?: string[];
  };
}
