import { z } from 'zod';

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
  tone?: string;
  pace?: string;
  formality?: string;
  empathyLevel?: string;
  languageVariant?: string;
  accentPreference?: string;
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
  verbatimLines?: { stepLabel: string; exactLine: string }[];
  transferConditions?: TransferCondition[];
  callFlowSteps?: any[];
  emergencyTriggers?: string[];
  outOfScopeTopics?: string[];
  guardrails?: {
    emergencyTriggers?: string[];
    emergencyAction?: string;
    prohibitions?: string[];
  };
  systemPromptCompiled?: boolean;
  operationalContext?: Record<string, string>;
  appliedRules?: any[];
  validationStatus?: 'success' | 'warning' | 'failed_review_required';
  validationErrors?: string[];
  validationWarnings?: string[];
  requiresHumanReview?: boolean;
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

export interface LlmService {
  generateConversationDesign(input: { template: string; business: BusinessSnapshot; mission: CallMission }): Promise<ConversationDesign>;
  runGapAudit(input: { business: BusinessSnapshot; mission: CallMission; conversation: ConversationDesign; personality: VoicePersonality }): Promise<GapAuditResult>;
  generateReviewDraft(input: BlueprintJson): Promise<PromptPackageDraft>;
  generateWithCoT?(input: BlueprintJson): Promise<PromptPackageDraft>;
  generateRaw?(prompt: string): Promise<string>;
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
    try {
      // Find the outermost {...} or [...] block
      const firstObj = cleanedRaw.indexOf('{');
      const lastObj = cleanedRaw.lastIndexOf('}');
      const firstArr = cleanedRaw.indexOf('[');
      const lastArr = cleanedRaw.lastIndexOf(']');
      
      if (firstObj !== -1 && lastObj !== -1 && (firstArr === -1 || firstObj < firstArr)) {
        return JSON.parse(cleanedRaw.substring(firstObj, lastObj + 1)) as T;
      }
      if (firstArr !== -1 && lastArr !== -1) {
        return JSON.parse(cleanedRaw.substring(firstArr, lastArr + 1)) as T;
      }
    } catch (e2) {
      // Ignore fallback extraction errors
    }
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
    voiceCharacteristics?: { pacing?: string; formality?: string; fillerWords?: boolean; accent?: string };
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
    silenceHandling?: { timeoutSeconds?: number; action?: string; maxReprompts?: number };
    interruptionPolicy?: string;
    digressionPolicy?: string;
    confirmationStyle?: string;
    dtmfFallback?: { enabled?: boolean; triggerAfterFailures?: number };
    closingScript?: string;
    steps: Array<{
      sequenceOrder: number;
      stateId: string;
      stateName: string;
      objective?: string;
      scriptDirective: string;
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
  };
  knowledgeBase: {
    faqs: Array<{ question: string; answer: string; isFallback?: boolean }>;
    objections: Array<{ trigger: string; response: string; isFallback?: boolean }>;
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

export const businessSpecificationSchema = z.object({
  meta: z.object({
    companyName: z.string().default("Enterprise Client"),
    agentName: z.string().default("Voice Assistant"),
    industry: z.string().default("General"),
    isRegulated: z.boolean().default(false),
    toneProfile: z.array(z.string()).default(["Professional", "Helpful"]),
    primaryGoal: z.string().default("Assist callers effectively"),
    languageMode: z.enum(["english", "hindi", "hinglish", "multilingual"]).default("english").optional(),
    callDirection: z.enum(["inbound", "outbound", "both"]).optional(),
    openingPhrase: z.string().optional(),
    voiceCharacteristics: z.object({
      pacing: z.string().optional(),
      formality: z.string().optional(),
      fillerWords: z.boolean().optional(),
      accent: z.string().optional()
    }).optional()
  }),
  businessSnapshot: z.object({
    operatingHours: z.union([
      z.string(),
      z.object({ standard: z.string().optional(), exceptions: z.array(z.string()).optional() })
    ]).default("Standard Business Hours"),
    exceptions: z.array(z.string()).optional(),
    servicesOffered: z.array(z.string()).default([]),
    policies: z.object({
      cancellation: z.string().default("Standard policy apply"),
      refunds: z.string().default("Case-by-case evaluation"),
      escalationNumbers: z.array(z.string()).default([]),
      disclosures: z.array(z.string()).optional()
    })
  }),
  callFlowPlan: z.object({
    userDefinedSteps: z.array(z.any()).optional(),
    entryRouting: z.array(z.object({ trigger: z.string(), goToStep: z.union([z.string(), z.number()]) })).optional(),
    silenceHandling: z.object({ timeoutSeconds: z.number().optional(), action: z.string().optional(), maxReprompts: z.number().optional() }).optional(),
    interruptionPolicy: z.string().optional(),
    digressionPolicy: z.string().optional(),
    confirmationStyle: z.string().optional(),
    dtmfFallback: z.object({ enabled: z.boolean().optional(), triggerAfterFailures: z.number().optional() }).optional(),
    closingScript: z.string().optional(),
    steps: z.array(z.object({
      sequenceOrder: z.number(),
      stateId: z.string(),
      stateName: z.string(),
      objective: z.string().optional(),
      scriptDirective: z.string(),
      slotsToCollect: z.array(z.string()).default([]),
      branchingConditions: z.array(z.any()).optional(),
      fallbackBehavior: z.string().optional(),
      maxRetries: z.number().optional(),
      onFailure: z.object({ afterRetries: z.number().optional(), action: z.string().optional(), target: z.string().optional(), fallbackLine: z.string().optional() }).optional(),
      confirmationRequired: z.boolean().optional(),
      digressionAllowed: z.boolean().optional(),
      invokesTools: z.array(z.string()).optional(),
      isFallback: z.boolean().optional(),
      isTerminal: z.boolean().optional()
    })).default([])
  }),
  knowledgeBase: z.object({
    faqs: z.array(z.object({
      question: z.string(),
      answer: z.string(),
      isFallback: z.boolean().optional()
    })).default([]),
    objections: z.array(z.object({
      trigger: z.string(),
      response: z.string(),
      isFallback: z.boolean().optional()
    })).default([])
  }),
  tools: z.array(z.object({
    name: z.string(),
    description: z.string(),
    parameters: z.record(z.string(), z.any()).default({}),
    associatedStateId: z.string()
  })).default([]),
  extractedEntities: z.object({
    departments: z.array(z.string()).default([]),
    namedContacts: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
    servicesOrOfferings: z.array(z.string()).default([])
  }).optional(),
  resolvedTopics: z.array(z.string()).default([]).optional(),
  capturedTopics: z.array(z.object({ topic: z.string(), summary: z.string() })).default([]).optional(),
  dynamicVariables: z.array(z.object({
    key: z.string(),
    label: z.string().optional().default(''),
    description: z.string().optional().default(''),
    type: z.string().optional().default('string'),
    fieldDirection: z.enum(['infield', 'outfield']).optional().default('outfield'),
    required: z.boolean().optional().default(false),
    defaultValue: z.string().optional().default(''),
    source: z.string().optional().default('extraction')
  })).default([]).optional(),
  guardrails: z.object({
    injectionResistance: z.string().optional(),
    disclosures: z.array(z.string()).optional(),
    emergencyTriggers: z.array(z.string()).optional(),
    emergencyAction: z.string().optional(),
    prohibitions: z.array(z.string()).optional()
  }).optional()
});
