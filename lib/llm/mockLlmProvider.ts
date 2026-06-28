import { USE_CASE_TEMPLATES } from '../templates';
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
  ChatMessage,
  BuilderChatTurnResponse,
} from './types';

export class MockLlmProvider implements LlmService {
  async generateConversationDesign(input: {
    template: string;
    business: BusinessSnapshot;
    mission: CallMission;
  }): Promise<ConversationDesign> {
    const tmpl = USE_CASE_TEMPLATES.find((t) => t.name === input.template || t.id === input.template) || USE_CASE_TEMPLATES[0];
    const bizName = input.business.businessName || "Our Company";
    const primaryGoal = input.mission.primaryGoal || "assisting callers";

    return {
      opening: `Hello, thank you for calling ${bizName}. My name is Alex. How can I help you today?`,
      intentDetection: tmpl.defaultIntents.map(i => `Listen for keywords related to ${i} and route to respective slot collection handler.`),
      intents: tmpl.defaultIntents.slice(0, 3).map((i, idx) => ({
        intent: i,
        description: `Caller wishes to handle ${i}.`,
        requiredFields: tmpl.commonRequiredFields,
        optionalFields: tmpl.commonOptionalFields,
        questionsToAsk: [
          `May I have your full name please?`,
          `And what is the best callback phone number in case we get disconnected?`,
          `What date and time were you hoping for?`
        ],
        confirmationRequired: true,
        completionAction: tmpl.suggestedFunctions[idx] || "commit_action",
        failurePath: "If caller cannot provide required details, offer to log a callback request.",
        escalationPath: "Transfer to live staff if caller expresses acute frustration or emergency."
      })),
      confirmationRules: [
        "Before completing any transaction or appointment change, read back all collected parameters clearly.",
        "Ask explicitly: 'Just to confirm, I have you down for [summary]. Is that correct?'",
        "Do not proceed until affirmative vocal confirmation is received."
      ],
      fallbackRules: [
        "If caller speech is indistinct, ask: 'I didn't quite catch that. Could you repeat that number for me?'",
        "If asked a question outside prompt scope, state: 'I don't have that specific information right now, but I can have a specialist reach out.'",
        "If caller says hello repeatedly, check audio connection."
      ],
      closingRules: [
        "Summarize next steps arranged during the call.",
        "Ask: 'Is there anything else I can assist you with today?'",
        `Conclude warmly: 'Thank you for calling ${bizName}. Have a wonderful day!'`
      ],
      faqCards: [
        { question: "What are your business hours?", answer: `We are open ${input.business.operatingHours || "Monday through Friday, 9 AM to 5 PM"}.` },
        { question: "Where are you located?", answer: `Our main office is located at ${input.business.location || "100 Innovation Way"}.` },
        { question: "What services do you offer?", answer: `We specialize in ${input.business.services?.join(", ") || input.business.description || "comprehensive solutions"}.` }
      ],
      objectionCards: [
        { objection: "I want to speak to a real human right now", handling: "Acknowledge calmly: 'I completely understand. Let me get your basic details first so our team can jump right in, or I can transfer you now.'" },
        { objection: "Why do you need my phone number?", handling: "Explain benefit: 'We only use this to send your confirmation SMS and reach back out if our call drops.'" }
      ],
      edgeCases: [
        { scenario: "Caller reporting urgent emergency or immediate safety threat", action: "Halt standard workflow immediately. Instruct caller to dial 911 or go to nearest emergency service." },
        { scenario: "Caller asking confidential account questions without verification", action: "Politely enforce security protocol: require PIN or identity verification before proceeding." }
      ]
    };
  }

  async runGapAudit(input: {
    business: BusinessSnapshot;
    mission: CallMission;
    conversation: ConversationDesign;
    personality: VoicePersonality;
  }): Promise<GapAuditResult> {
    const missing: GapAuditResult['missingCriticalDetails'] = [];

    if (!input.business.operatingHours || input.business.operatingHours.trim() === "") {
      missing.push({
        field: "Operating Hours",
        whyItMatters: "Callers frequently inquire about opening times or scheduling windows.",
        questionToAskUser: "What are your exact operating hours and days?",
        recommendedDefault: "Monday to Friday, 9:00 AM to 5:00 PM"
      });
    }

    if ((input.mission.confirmationRequiredFor || []).length === 0) {
      missing.push({
        field: "Confirmation Wording Rule",
        whyItMatters: "Preventing AI irreversible execution errors requires strict verbal readback rules.",
        questionToAskUser: "Should the agent confirm bookings/orders directly via voice readback or send an SMS confirmation link?",
        recommendedDefault: "Direct verbal readback required before committing action"
      });
    }

    if (!input.business.location || input.business.location.trim() === "") {
      missing.push({
        field: "Physical Location / Service Area",
        whyItMatters: "Callers need clear arrival instructions or regional coverage confirmation.",
        questionToAskUser: "What is your physical address or geographical coverage radius?",
        recommendedDefault: "Online / Nationwide Telehealth & Digital Suite"
      });
    }

    return {
      readinessScore: missing.length === 0 ? 98 : Math.max(65, 95 - missing.length * 10),
      missingCriticalDetails: missing.slice(0, 7),
      canGenerateWithoutFollowup: missing.length === 0
    };
  }

  async generateBuilderChatReply(messages: ChatMessage[], currentBlueprint: Partial<BlueprintJson>): Promise<BuilderChatTurnResponse> {
    const lastMsg = messages[messages.length - 1]?.content || "";
    const bizName = currentBlueprint.business?.businessName || "Your Business";
    
    // Simple heuristic for mock replies
    if (messages.length <= 1) {
      return {
        reply: `That sounds like a great use case! To make sure the prompt covers everything for ${bizName}, what are the main tasks or questions callers typically have?`,
        isReadyToGenerate: false,
        extractedBlueprint: {
          useCase: lastMsg.slice(0, 50),
          business: { ...currentBlueprint.business, description: lastMsg }
        },
        missingDetails: ["Supported intents", "Required caller fields"]
      };
    } else if (messages.length === 2) {
      return {
        reply: "Got it. And how would you like the agent to handle difficult callers or objections (e.g., asking to speak to a human)?",
        isReadyToGenerate: false,
        extractedBlueprint: {
          mission: { ...currentBlueprint.mission, primaryGoal: lastMsg }
        },
        missingDetails: ["Objection handling"]
      };
    } else {
      return {
        reply: "Perfect! I have all the details needed to build a highly detailed, 2-part template-driven prompt for your AI agent. Click 'Generate Prompt Package' below when you are ready!",
        isReadyToGenerate: true,
        extractedBlueprint: {},
        missingDetails: []
      };
    }
  }

  async generateReviewDraft(input: BlueprintJson): Promise<PromptPackageDraft> {
    const bizName = input.business.businessName || "Our Enterprise";
    const agentName = (input.personality.phrasesToUse || [])[0] ? "Sarah" : "Alex";
    const role = input.mission.primaryGoal || "Voice Automation Assistant";
    const tone = input.personality.tone || "Warm, empathetic, professional, calm";
    const language = input.business.languageStyle || "Clear everyday spoken English";

    const agentPrompt = `<agent_instruction>

## 1. IDENTITY & CONTEXT
* **Agent Name:** ${agentName}
* **Company/Clinic:** ${bizName}
* **Role:** ${role}
* **Tone:** ${tone}
* **Language & Grammar:** ${language}

**Session Variables (Injected at Runtime):**
* \`Customer_Name\`: {{Customer_Name}}
* \`Customer_Phone\`: {{Customer_Phone}}
* \`Custom_Variable_1\`: {{Custom_Variable_1}}

---

## 4. THE CALL FLOW (STATE MACHINE)
Follow this sequence strictly. Never skip steps unless the user preemptively provides the required information.

**Step 1 — Greeting & Verification**
* Speak exactly: *"Hello {{Customer_Name}}, this is ${agentName} calling from ${bizName}. How can I assist you today?"*
* Wait for confirmation. If the user sounds confused, re-explain the reason for the call.

**Step 2 — Requirement Collection Phase 1**
* Ask: *"May I verify your full request details?"*
* Note: Validate spoken details clearly before moving on.

**Step 3 — Requirement Collection Phase 2**
* Ask: *"And what is the best callback number or preferred schedule?"*
* Note: Use validate_digit_input when collecting numerical digits.

**Step 4 — Final Summary & Confirmation**
* Summarize all collected data: *"To confirm, I have recorded your details for ${bizName}. Does everything look correct?"*
* If confirmed: Proceed to Closing Protocol.
* If user corrects data: Update the specific field silently and re-summarize.

---

## 5. SITUATION HANDLERS & Q&A
Use these handlers only when triggered by the user. After handling, always resume the flow exactly where you left off.

* **Objection 1 (Human Transfer Request):**
  * Trigger: User says "I want to speak to a real person"
  * Action: Say "I understand completely. Let me gather your basic details so our team can assist you immediately." Maximum one attempt; if they refuse again, initiate Closing Protocol.
* **Busy / Voicemail / IVR:**
  * Trigger: Answering machine beep, "Switched off", or "Call back later".
  * Action: Speak the refusal close phrase and execute \`end_call\` in the exact same turn.
* **Angry / Uncooperative User:**
  * Trigger: User is hostile or repeatedly refuses to answer.
  * Action: Say "I understand. You are welcome to call back at any time. Goodbye." Execute \`end_call\`.
* **Out of Scope Questions:**
  * Trigger: User asks a question you do not have the answer to.
  * Action: Say "I do not have that information available, but I will record your question for our team." Resume flow.

</agent_instruction>`;

    const systemPrompt = `<agent_instruction>

## 2. HARD GATES & GLOBAL RULES (ABSOLUTE)
Priority: HARD GATE > RULE > GUIDELINE. Violating these is a critical failure.

1. **Safety & Scope:** Never provide advice outside your specific domain[cite: 6]. Do not invent pricing, guarantees, or false details[cite: 4, 6]. 
2. **Turn-Taking (IRON RULE):** Every turn equals ONE thing only: one question OR one instruction. Never ask two questions in one turn[cite: 3, 4]. Stop and wait for the user to reply[cite: 4].
3. **No Per-Field Readbacks:** Do not confirm individual fields mid-collection[cite: 6]. Collect all information silently and confirm it all at once during the final summary[cite: 6].
4. **No Praise / Filler:** Never use filler words like "Perfect," "Great," "Awesome," or "Absolutely"[cite: 4, 6]. Use minimal acknowledgments (e.g., "Understood," "Alright") only when necessary[cite: 3, 4].
5. **TTS & Output Formatting:** 
   * Spell out numbers as words for TTS engines (e.g., read phone numbers digit-by-digit like "nine eight zero")[cite: 4, 6].
   * Never output Markdown symbols (\`*\`, \`_\`, \`[]\`) or meta-commentary like "(Pause)"[cite: 3, 4]. 
   * Keep output to pure spoken text and basic punctuation (\`.\`, \`,\`, \`?\`)[cite: 3].
6. **Tool Invocation:** Tools must be called silently[cite: 6]. Never speak tool names, JSON payloads, or function parameters aloud[cite: 4, 6].

---

## 3. PRE-TURN CHECKLIST (SILENT EVALUATION)
Run this checklist silently before generating every response[cite: 3, 4]:
* [ ] **History Check:** Has the user already answered the upcoming question? If yes, skip it and move to the next step[cite: 3, 4].
* [ ] **Interruption Check:** Did the user ask a question in their last turn? Answer it briefly before continuing the flow[cite: 4].
* [ ] **One Goal Check:** Does this turn contain more than one question? If yes, split it and keep only the first[cite: 4].
* [ ] **End Call Check:** Has the closing sequence been triggered? If yes, output \`""\` (empty string) and immediately execute the \`end_call\` tool[cite: 3, 4].

---

## 6. CLOSING PROTOCOL
You must output exactly one closing phrase and trigger the \`end_call\` tool in the SAME turn[cite: 4, 6]. After this turn, output nothing further[cite: 6].

* **Successful Completion Close:**
  * *"Thank you for your time. We have recorded everything accurately. Have a great day."*[cite: 4, 6]
* **Not Interested / Refusal Close:**
  * *"Thank you for your time. If you need assistance in the future, we are available. Have a great day."*[cite: 4]
* **Wrong Number Close:**
  * *"I apologize, I have reached the wrong number. Have a good day."*[cite: 3]

---

## 7. CORE VOICE FUNCTION DEFINITIONS

### end_call
End the voice call after the closing agent's one-shot terminal closing turn. Call this in the SAME turn as the closing phrase; no further turns will be processed.
Parameters:
- \`reason\` (string, optional): Optional short reason such as goodbye, wrong_number, refusal, voicemail, or verification_complete.

### validate_digit_input
Validate phone number or pin-code digits from a spoken user turn, including partial input and repeated STT fragments.
Parameters:
- \`field\` (string, required): Human-readable field name: whatsapp, pin, or mobile_number.
- \`expected_digits\` (integer, required): Required digit count, typically 10 for phone numbers or 6 for pin codes.
- \`user_text\` (string, required): Latest customer utterance.
- \`previously_collected\` (string, optional): ALL digits collected so far in previous turns for this field. CRITICAL: If the user provided digits in recent turns but you did not call this tool, YOU MUST extract and include them here to prevent data loss.

</agent_instruction>`;

    const qualityReview: QualityReview = {
      overallScore: 94,
      completionScore: 92,
      safetyScore: 98,
      voiceStyleScore: 94,
      structureScore: 95,
      edgeCaseScore: 92,
      humanQualityScore: 94,
      hallucinationResistanceScore: 96,
      minimumManualEditScore: 92,
      issues: [],
      recommendedImprovements: [],
      readyToPublish: true
    };

    return {
      agentPrompt,
      systemPrompt,
      dynamicVariables: [
        { key: "Customer_Name", label: "Customer Name", type: "caller", required: true, defaultValue: "John Doe", source: "runtime", description: "Caller full name" },
        { key: "Customer_Phone", label: "Customer Phone", type: "caller", required: true, defaultValue: "555-0199", source: "runtime", description: "Caller ANI or callback number" },
        { key: "Custom_Variable_1", label: "Custom Variable 1", type: "business", required: false, defaultValue: "General Inquiry", source: "static", description: "Primary requirement" }
      ],
      suggestedFunctions: [
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
        },
        { name: "check_availability", category: "Calendar", description: "Check open appointment slots", purposeInPrompt: "Verify slot before readback", requiredInputs: ["date"], expectedOutputs: ["slots"], enabled: true }
      ],
      knowledgeBaseSuggestions: [
        { title: "Standard Cancellation Policy", content: "24 hours advance notice required for all cancellations.", category: "Policy" },
        { title: "Parking & Arrival Guidance", content: "Guest parking available in visitor stalls marked 101-110.", category: "Location" }
      ],
      faqCards: input.conversation.faqCards || [
        { question: "What are your operating hours?", answer: input.business.operatingHours || "Monday to Friday 9am to 5pm." }
      ],
      objectionCards: input.conversation.objectionCards || [
        { objection: "I want a real person", handling: "Let me grab your basic details so the live team can assist you immediately." }
      ],
      edgeCaseRules: input.conversation.edgeCases || [
        { scenario: "Caller reporting medical emergency or danger", action: "Stop flow. Instruct caller to hang up and dial 911 immediately." }
      ],
      testScenarios: [
        { title: "Standard Happy Path Enquiry", persona: "easy caller", callerGoal: "Book appointment for Thursday afternoon", sampleCallerMessage: `Hi ${agentName}, I'd like to schedule an appointment for this Thursday afternoon.`, expectedAgentBehavior: "Collect caller name and callback number, check Thursday afternoon slots, read back confirmation before committing.", riskLevel: "low" },
        { title: "Caller Expressing Frustration", persona: "angry caller", callerGoal: "Complain about dropped call earlier", sampleCallerMessage: "This is ridiculous, I got cut off twice already and nobody called me back!", expectedAgentBehavior: "De-escalate calmly with empathy. Offer immediate live staff transfer or priority callback logging.", riskLevel: "high" },
        { title: "Caller Asking Out of Scope Price", persona: "price-sensitive caller", callerGoal: "Demand custom wholesale discount rates", sampleCallerMessage: "Can you give me a 40% discount if I sign a contract today?", expectedAgentBehavior: "Politely explain pricing boundaries. Offer to connect with a sales account executive.", riskLevel: "medium" }
      ],
      qualityReview
    };
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
    const length = agentPrompt.length + systemPrompt.length;
    const hasConf = agentPrompt.includes("confirm") || agentPrompt.includes("read back");
    const hasEsc = agentPrompt.includes("escalate") || agentPrompt.includes("transfer") || agentPrompt.includes("911");
    const hasFaq = agentPrompt.includes("FAQ") || agentPrompt.includes("Hours");

    let score = 90;
    if (!hasConf) score -= 10;
    if (!hasEsc) score -= 10;

    return {
      overallScore: score,
      completionScore: score - 2,
      safetyScore: hasEsc ? 96 : 78,
      voiceStyleScore: 92,
      structureScore: 90,
      edgeCaseScore: hasEsc ? 91 : 80,
      humanQualityScore: score + 1,
      hallucinationResistanceScore: 94,
      minimumManualEditScore: 91,
      issues: hasConf ? [] : [{ severity: 'high', issue: 'Missing readback confirmation pattern', fix: 'Add explicit verbal readback confirmation rule.' }],
      recommendedImprovements: ["Periodically audit test scenarios against real production transcripts."],
      readyToPublish: score >= 85
    };
  }

  async simulatePromptTurn(input: SimulationTurnInput): Promise<SimulationTurnOutput> {
    const msg = input.callerMessage.toLowerCase();
    const isAngry = input.persona.includes("angry") || msg.includes("ridiculous") || msg.includes("supervisor") || msg.includes("manager") || msg.includes("hate");
    const isEmergency = input.persona.includes("emergency") || msg.includes("chest pain") || msg.includes("bleeding") || msg.includes("911") || msg.includes("fire") || msg.includes("suicide");
    const isAiQuestion = msg.includes("are you a robot") || msg.includes("are you an ai") || msg.includes("real person") || msg.includes("artificial");
    const isPrice = msg.includes("how much") || msg.includes("cost") || msg.includes("price") || msg.includes("discount");

    if (isEmergency) {
      return {
        simulatedResponse: "This sounds like an urgent medical or safety emergency. Please hang up immediately and dial 911 or go to the nearest hospital emergency room.",
        detectedIntent: "emergency_escalation",
        collectedVariables: {},
        nextRequiredField: "none (flow terminated)",
        guardrailTriggered: true,
        issueNotes: "Triggered emergency safety halt rule."
      };
    }

    if (isAngry) {
      return {
        simulatedResponse: "I completely understand your frustration, and I want to make sure this gets sorted out for you right away. Let me transfer you directly to a senior supervisor who can assist you immediately.",
        detectedIntent: "human_handoff",
        collectedVariables: { caller_sentiment: "frustrated" },
        nextRequiredField: "handoff_queue",
        guardrailTriggered: true,
        issueNotes: "Triggered de-escalation handoff rule."
      };
    }

    if (isAiQuestion) {
      return {
        simulatedResponse: "Yes, I am an AI virtual assistant supporting the team today. I can help capture your details or connect you with a live staff member if you prefer.",
        detectedIntent: "ai_disclosure_check",
        collectedVariables: {},
        nextRequiredField: "caller_intent",
        guardrailTriggered: false,
        issueNotes: "Transparent AI disclosure executed per system prompt."
      };
    }

    if (isPrice) {
      return {
        simulatedResponse: "Our standard consultations start at $85. For custom services or exact package estimates, let me capture your contact details so our pricing team can send you a tailored breakdown.",
        detectedIntent: "pricing_enquiry",
        collectedVariables: { inquiry_type: "pricing" },
        nextRequiredField: "caller_name",
        guardrailTriggered: false,
        issueNotes: "Handled pricing enquiry safely without hallucinating custom discounts."
      };
    }

    return {
      simulatedResponse: "Certainly! I would be happy to help you arrange that today. May I start by grabbing your full name and best callback phone number?",
      detectedIntent: "general_intake",
      collectedVariables: { initial_intent: "service_request" },
      nextRequiredField: "caller_name",
      guardrailTriggered: false,
      issueNotes: "Standard happy path intake turn."
    };
  }

  async improvePromptWithCritique(draft: PromptPackageDraft, critique: QualityReview): Promise<PromptPackageDraft> {
    const updatedAgentPrompt = draft.agentPrompt + `\n\n## 16. Self-Critique Refinements\nRefined based on automated quality evaluation score (${critique.overallScore}/100):\n` + (critique.recommendedImprovements?.map(imp => `- ${imp}`).join("\n") || "");

    return {
      ...draft,
      agentPrompt: updatedAgentPrompt,
      qualityReview: {
        ...critique,
        overallScore: Math.min(99, critique.overallScore + 4),
        humanQualityScore: Math.min(99, critique.humanQualityScore + 3),
        issues: [],
        readyToPublish: true
      }
    };
  }
}
