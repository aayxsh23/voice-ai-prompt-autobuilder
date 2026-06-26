export interface BusinessSnapshot {
  businessName?: string;
  industry?: string;
  location?: string;
  description?: string;
  services?: string[];
  callerTypes?: string[];
  conversationDirection?: 'inbound' | 'outbound' | 'both' | string;
  operatingHours?: string;
  languageStyle?: string;
  sensitiveTopics?: string[];
  restrictedClaims?: string[];
  complianceNotes?: string;
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
  agentPrompt: string;
  systemPrompt: string;
  dynamicVariables: DynamicVariableSpec[];
  suggestedFunctions: SuggestedFunctionSpec[];
  knowledgeBaseSuggestions: { title: string; content: string; category: string }[];
  faqCards: { question: string; answer: string }[];
  objectionCards: { objection: string; handling: string }[];
  edgeCaseRules: { scenario: string; action: string }[];
  testScenarios: TestScenarioSpec[];
  qualityReview: QualityReview;
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
}

export interface BlueprintJson {
  useCase: string;
  selectedTemplate: string;
  business: BusinessSnapshot;
  mission: CallMission;
  conversation: ConversationDesign;
  personality: VoicePersonality;
  followupAnswers: Record<string, string>;
}

export interface LlmService {
  generateConversationDesign(input: { template: string; business: BusinessSnapshot; mission: CallMission }): Promise<ConversationDesign>;
  runGapAudit(input: { business: BusinessSnapshot; mission: CallMission; conversation: ConversationDesign; personality: VoicePersonality }): Promise<GapAuditResult>;
  generateReviewDraft(input: BlueprintJson): Promise<PromptPackageDraft>;
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
}

export function safeParseJson<T>(raw: string, fallback: T): T {
  try {
    let cleaned = raw.trim();
    // Strip markdown fences
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();
    return JSON.parse(cleaned) as T;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('safeParseJson failed, returning fallback:', error);
    }
    return fallback;
  }
}
