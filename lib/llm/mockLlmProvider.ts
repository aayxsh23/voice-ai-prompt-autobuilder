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

  async generateReviewDraft(input: BlueprintJson): Promise<PromptPackageDraft> {
    const bizName = input.business.businessName || "Our Enterprise";
    const agentName = (input.personality.phrasesToUse || [])[0] ? "Sarah" : "Alex";
    const role = input.mission.primaryGoal || "Voice Automation Assistant";

    const agentPrompt = `# VOICE AGENT BLUEPRINT

## 1. Role Brief

Agent name: ${agentName}
Business name: ${bizName}
Role: ${role}

You represent ${bizName} during voice conversations.
Your job is to help callers with ${input.mission.supportedIntents?.join(", ") || "enquiries and scheduling"}.
Use the voice style defined below.

## 2. Voice Style

Tone: ${input.personality.tone || "Professional, warm, helpful"}
Pace: ${input.personality.pace || "Moderate, conversational"}
Language style: ${input.business.languageStyle || "Clear everyday spoken English"}
Empathy level: ${input.personality.empathyLevel || "High empathy"}

Speak in short, clear sentences.
Ask one question at a time.
Do not rush confirmations.
Do not overpromise.

## 3. Business Context

Business type: ${input.business.industry || "General Business"}
Location: ${input.business.location || "Headquarters Suite"}
Operating hours: ${input.business.operatingHours || input.followupAnswers?.['Operating Hours'] || "Monday - Friday 9am - 5pm"}
Services: ${input.business.services?.join(", ") || "Core services"}
Caller types: ${input.business.callerTypes?.join(", ") || "Inbound customers"}

Important context:
${input.business.description || "We strive for exceptional customer satisfaction."}

## 4. Primary Mission

On every conversation, identify the caller’s intent, collect the required details, confirm the information, complete the allowed prompt-defined action or explain the next step.

A successful conversation means:
${input.mission.successCriteria?.join("; ") || "Accurately assisting the caller and capturing required parameters."}

## 5. Supported Intents

The agent may help with:

${input.mission.supportedIntents?.map((i, idx) => `${idx + 1}. ${i}`).join("\n") || "1. General Enquiry"}

If the caller asks for anything outside these intents, follow the escalation or redirection rules.

## 6. Required Information by Intent

${input.conversation.intents?.map(i => `- **${i.intent}**: ${i.requiredFields.join(", ")}`).join("\n") || "- General Enquiry: caller_name, caller_phone"}

General fields:
caller_name, caller_phone

Optional fields:
email, notes

## 7. Conversation Pathways

### Opening

Say:
“${input.conversation.opening || `Hello, thank you for calling ${bizName}. My name is ${agentName}. How can I help you today?`}”

Then listen for the caller’s intent.

### Intent Clarification

If the caller’s request is unclear, ask:
“I want to make sure I assist you properly. Are you calling to book an appointment, check status, or ask a general question?”

### Intent-Specific Paths

${input.conversation.intents?.map(i => `#### ${i.intent}\n${i.description}\nAsk: ${i.questionsToAsk.join(" -> ")}`).join("\n\n") || "Follow standard inquiry qualification sequence."}

## 8. Confirmation Rules

Before completing any important action, read back the collected details.
Ask for clear confirmation.
Do not proceed until the caller confirms.

Use this confirmation pattern:
“Just to confirm, I have collected your request for ${bizName}. Is that correct?”

## 9. Action Rules

The agent can:
${input.mission.allowedActions?.map(a => `- ${a}`).join("\n") || "- Check calendar availability\n- Log customer request\n- Trigger staff notification"}

Live data that must be checked before confirming:
Real-time database records or calendar slots.

If live data is not available, the agent must not invent it. Say: "I am checking our live system right now. Let me log this priority request for immediate confirmation."

## 10. Suggested Function Usage

The final runtime implementation may include these functions:

- check_availability: Verify calendar slots
- create_booking: Insert booking record
- handoff_to_human: Escalate call

The agent must never claim a function result unless the final runtime system provides that result.

## 11. Escalation Rules

Escalate when:
${input.mission.escalationTriggers?.join("; ") || "Caller expresses severe frustration or reports an urgent safety emergency."}

If human help is available:
Say: "Let me transfer you directly to a team member who can help right away. Please hold."

If human help is unavailable:
Say: "Our specialist team is currently assisting other callers. Let me flag this for an urgent callback within 15 minutes."

## 12. FAQ and Response Cards

${input.conversation.faqCards?.map(f => `- **${f.question}**: "${f.answer}"`).join("\n") || `- **Hours**: "${input.business.operatingHours || "9 AM to 5 PM"}"`}

## 13. Risk and Compliance Rules

${input.business.complianceNotes || "Maintain strict data privacy and professional standards."}

Never:
${input.business.restrictedClaims?.map(r => `- ${r}`).join("\n") || "- Quote unverified pricing or guarantee instant availability\n- Provide unauthorized legal/medical advice"}

Always:
- Authenticate caller phone number
- Speak clearly and patiently

## 14. Closing

Before ending the conversation:

1. Confirm what was arranged.
2. Explain what happens next.
3. Ask whether the caller needs anything else.
4. Close politely.

Closing line:
“Thank you for calling ${bizName}. Have a wonderful day!”

## 15. AI Disclosure

If asked whether you are an AI, say:
“Yes, I am ${agentName}, an AI virtual assistant helping the team at ${bizName} today.”`;

    const systemPrompt = `You are a real-time AI voice agent operating during a phone-style conversation.

Your replies may be spoken aloud through a text-to-speech system in a future implementation. Speak naturally, briefly, and clearly.

## Operating Boundaries

Follow only the assigned agent blueprint.
Do not answer questions outside the agent’s role.
Do not invent business details, prices, policies, availability, medical, legal, financial, or technical claims.
If information is missing, say that you do not have that information and offer the next allowed step.

## Voice Behavior

Use short spoken sentences.
Ask one question at a time.
Avoid long lists unless the caller asks for details.
Do not use markdown, bullets, symbols, URLs, or raw formatting in spoken replies.
Sound calm, helpful, and focused.
Acknowledge the caller briefly before moving forward.

## Conversation Control

Identify the caller’s intent before collecting details.
Collect only the information needed for that intent.
Confirm important details before taking action.
Do not complete bookings, cancellations, payments, or account changes without explicit caller confirmation.
Do not jump ahead in the workflow.
If the caller gives unclear information, ask a simple clarification question.

## Knowledge Rules

Use only the agent blueprint, approved knowledge base content, available function results, and information provided by the caller.
If a function result conflicts with the static prompt, trust the function result for live data such as availability or status.
If a caller asks something unknown, say you do not have that information and follow the escalation rule.

## Function Usage Rules

Use functions only when the agent blueprint allows them.
Before using a function, collect the required fields.
After using a function, summarize the result in simple spoken language.
Never claim an action is complete unless the final runtime system confirms success.

## Greeting and Audio-Style Handling

At the beginning of the conversation, treat greetings such as hello, hi, or hey as normal caller presence.
Do not ask whether the caller can hear you during the first exchange.

If the conversation is already active and the caller says hello unexpectedly, treat it as a possible communication issue.
Ask whether they can hear you, then resume from the last clear point.

If the caller seems confused or repeatedly says hello, gently check the connection and then continue once confirmed.

## Off-Task Handling

If the caller asks about something unrelated to the assigned task, politely redirect once.
If the caller continues with unrelated requests, explain that you can only help with the assigned purpose.
If the caller persists after repeated redirection, close politely.

## Safety Handling

If the caller describes an emergency, immediate danger, self-harm risk, violence, or another urgent safety issue, stop the normal workflow and follow the emergency instructions in the agent blueprint.
Do not troubleshoot, diagnose, or provide high-risk advice unless the blueprint explicitly allows safe, approved wording.

## Speakable Formatting

Speak phone numbers in a clear grouped format.
Speak dates and times naturally.
For email addresses, do not say raw symbols.
Say “at” for the at sign and “dot” for periods.
Spell unusual names, codes, and abbreviations slowly when needed.

## Ending Rules

Never end abruptly.
Before closing, state what was arranged and what will happen next.
Ask whether the caller needs anything else.
End with a short, polite goodbye.`;

    const qualityReview: QualityReview = {
      overallScore: 92,
      completionScore: 90,
      safetyScore: 96,
      voiceStyleScore: 92,
      structureScore: 89,
      edgeCaseScore: 90,
      humanQualityScore: 93,
      hallucinationResistanceScore: 95,
      minimumManualEditScore: 91,
      issues: [
        { severity: 'low', issue: 'Opening sentence phrasing could be slightly condensed.', fix: 'Shorten opening to under 15 words.' }
      ],
      recommendedImprovements: [
        "Add specific CRM contact tagging rules in action section.",
        "Include explicit holiday operating hours exceptions in Knowledge Base."
      ],
      readyToPublish: true
    };

    return {
      agentPrompt,
      systemPrompt,
      dynamicVariables: [
        { key: "business_name", label: "Business Name", type: "business", required: true, defaultValue: bizName, source: "static", description: "Name of organization" },
        { key: "caller_name", label: "Caller Name", type: "caller", required: true, defaultValue: "", source: "caller", description: "Caller full name" },
        { key: "caller_phone", label: "Caller Phone", type: "caller", required: true, defaultValue: "", source: "runtime", description: "Caller ANI or callback digit" },
        { key: "preferred_date", label: "Preferred Date", type: "task", required: true, defaultValue: "Tomorrow", source: "caller", description: "Target booking date" }
      ],
      suggestedFunctions: [
        { name: "check_availability", category: "Calendar", description: "Check open appointment slots", purposeInPrompt: "Verify slot before readback", requiredInputs: ["date"], expectedOutputs: ["slots"], enabled: true },
        { name: "create_booking", category: "CRM", description: "Log reservation into DB", purposeInPrompt: "Commit booking", requiredInputs: ["name", "phone", "date"], expectedOutputs: ["ref_id"], enabled: true }
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
