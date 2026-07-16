import type { BusinessSpecification, ChatMessage } from '@/lib/llm/types';

/**
 * Domain fixtures for the contract harness.
 *
 * These are COVERAGE, not fixes. When a new use case appears the right response is
 * to add a fixture here — never to add a branch in the compiler. A change that only
 * helps one domain will visibly break the others, which is the whole point.
 *
 * Each fixture is a realistic `spec` + `transcript` plus the expectations that are
 * specific to that domain. Universal expectations live in promptContracts.ts.
 */
export interface DomainFixture {
  id: string;
  name: string;
  spec: BusinessSpecification;
  transcript: ChatMessage[];
  expect: {
    /** Substrings that must appear in the assembled prompt. */
    mustContain?: string[];
    /** Patterns that must NOT appear. */
    mustNotContain?: RegExp[];
  };
}

const emptyKb = { faqs: [], objections: [] };

/** A normal state. `next` is the sequenceOrder to advance to on success. */
function st(order: number, stateId: string, stateName: string, objective: string, scriptDirective: string, slotsToCollect: string[], next: number) {
  return {
    sequenceOrder: order, stateId, stateName, objective, scriptDirective, slotsToCollect,
    branchingConditions: [{ condition: 'Caller responds', goToStep: next }],
    fallbackBehavior: '', maxRetries: 3, invokesTools: [] as string[],
  };
}

/** A terminal state; wires end_call so the flow-completeness rules are satisfied. */
function term(order: number, stateId: string, stateName: string, objective: string, scriptDirective: string) {
  return {
    sequenceOrder: order, stateId, stateName, objective, scriptDirective,
    slotsToCollect: [] as string[],
    branchingConditions: [{ condition: 'Concluding call', goToStep: 'end_call' as const, reason: 'completed' }],
    fallbackBehavior: '', maxRetries: 1, invokesTools: ['end_call'], isTerminal: true,
  };
}

/**
 * Outbound cross-sell, Qatar, English-only. Reproduces the real brief that exposed
 * the missing-pitch, US-911-in-Qatar, and instruction-as-speech failures.
 */
const vlccQatar: DomainFixture = {
  id: 'vlcc_qatar',
  name: 'VLCC Qatar Outbound Cross-Sell',
  spec: {
    meta: {
      companyName: 'VLCC Qatar', agentName: 'Sara', industry: 'Beauty & Wellness',
      isRegulated: false, toneProfile: ['Warm', 'Consultative'],
      primaryGoal: 'Cross-sell Beauty to Slimming customers and Slimming to Beauty customers',
      languageMode: 'english', callDirection: 'outbound',
      aiDisclosure: 'disclose', agentGender: 'female', region: 'QA',
    },
    businessSnapshot: {
      operatingHours: 'Open daily from 10:00 AM to 10:00 PM',
      servicesOffered: ['Slimming', 'Beauty'],
      policies: { cancellation: 'None — not specified', refunds: 'None — not specified', escalationNumbers: [] },
    },
    callFlowPlan: {
      requiredStages: [
        { id: 'opening', label: 'Opening and permission to talk' },
        { id: 'context_reminder', label: 'Warm context reminder' },
        { id: 'cross_sell_pitch', label: 'Cross-sell pitch' },
        { id: 'offer_consultation', label: 'Offer free consultation' },
        { id: 'collect_booking', label: 'Collect booking details' },
        { id: 'readback', label: 'Read back confirmation' },
        { id: 'close', label: 'Close' },
      ],
      silenceHandling: { timeoutSeconds: 10, action: "Ask if they are still there" },
      dtmfFallback: { enabled: false },
      retryExhaustion: { afterRetries: 3, action: 'Politely wrap up and end the call' },
      steps: [
        st(1, 'opening', 'Opening', 'Greet and get permission to talk',
          `Say: "Hi {{customer_name}}, this is Sara, an AI assistant from VLCC Qatar. Is now a good time?"`, [], 2),
        st(2, 'context_reminder', 'Context reminder', 'Reference their last visit',
          `Say: "I'm calling about your recent {{last_purchase_or_service}} with us. How has that been?"`, [], 3),
        st(3, 'cross_sell_pitch', 'Cross-sell pitch', 'Pitch the opposite category to {{existing_segment}}',
          `Say: "Since you've been with us for {{existing_segment}}, I think our other side would suit you. Can I share a little?"`, [], 4),
        st(4, 'offer_consultation', 'Offer consultation', 'Offer a free consultation',
          `Say: "We can book you a free consultation to talk it through. Would that help?"`, [], 5),
        st(5, 'collect_booking', 'Collect booking', 'Collect the booking day',
          `Say: "Which day suits you best?"`, ['booking_date'], 6),
        st(6, 'readback', 'Read back', 'Confirm the details',
          `Say: "So that is a consultation at Al Waab on Thursday evening. Have I got that right?"`, [], 7),
        term(7, 'close', 'Close', 'Close the call',
          `Say: "Lovely. We will text you the details. Thanks for your time, and take care!"`),
      ],
    },
    knowledgeBase: emptyKb,
    tools: [],
    dynamicVariables: [
      { key: 'customer_name', label: 'Customer name', fieldDirection: 'infield', source: 'crm' },
      { key: 'existing_segment', label: 'Existing segment', fieldDirection: 'infield', source: 'crm' },
      { key: 'last_purchase_or_service', label: 'Last purchase', fieldDirection: 'infield', source: 'crm' },
    ],
    guardrails: { prohibitions: ['Never collect payment details, OTP, bank info, or national ID on the call'] },
  } as unknown as BusinessSpecification,
  transcript: [
    { role: 'user', content: 'Outbound agent for VLCC Qatar named Sara, female, English only, no code-switching. Cross-sell: Slimming customers get pitched Beauty, Beauty customers get pitched Slimming.' },
    { role: 'user', content: 'Never collect payment details, OTP, bank info, or QID on the call. Nudge after 10 seconds of silence. Voice only, no keypad. After 3 failed attempts politely wrap up and hang up.' },
  ],
  expect: {
    mustContain: ['VLCC Qatar', 'Sara'],
    // Qatar deployment: US emergency numbers would be actively dangerous.
    mustNotContain: [/\b911\b/, /\b988\b/],
  },
};

/** Hindi/Devanagari coverage — the existing canonical set was 100% English. */
const margErpHinglish: DomainFixture = {
  id: 'marg_erp_hinglish',
  name: 'Marg ERP Demo Booking (Hinglish)',
  spec: {
    meta: {
      companyName: 'Marg ERP', agentName: 'Riya', industry: 'Software',
      isRegulated: false, toneProfile: ['Friendly'],
      primaryGoal: 'Book an online demo of the ERP software with business owners',
      languageMode: 'hinglish', callDirection: 'outbound',
      aiDisclosure: 'disclose', agentGender: 'female', region: 'IN',
      targetTTS: 'ElevenLabs',
    },
    businessSnapshot: {
      operatingHours: 'Mon-Sat 10am-7pm',
      servicesOffered: ['ERP software', 'online demo'],
      policies: { cancellation: 'None — not specified', refunds: 'None — not specified', escalationNumbers: [] },
    },
    callFlowPlan: {
      requiredStages: [
        { id: 'opening', label: 'Opening' },
        { id: 'demo_pitch', label: 'Demo pitch' },
        { id: 'collect_whatsapp', label: 'Collect WhatsApp number' },
        { id: 'close', label: 'Close' },
      ],
      steps: [
        st(1, 'opening', 'Opening', 'Greet the owner',
          `Say: "नमस्ते {{owner_name}}, मैं Marg ERP से Riya बात कर रही हूँ। क्या अभी बात कर सकते हैं?"`, [], 2),
        st(2, 'demo_pitch', 'Demo pitch', 'Pitch the online demo',
          `Say: "हमारा ERP software आपकी billing और inventory आसान कर सकता है। क्या मैं थोड़ा बता सकती हूँ?"`, [], 3),
        st(3, 'collect_whatsapp', 'Collect WhatsApp', 'Collect the WhatsApp number',
          `Say: "डेमो link किस WhatsApp number पर भेजूँ?"`, ['whatsapp_number'], 4),
        term(4, 'close', 'Close', 'Close the call',
          `Say: "बढ़िया, मैं link भेज देती हूँ। आपका दिन शुभ हो!"`),
      ],
    },
    knowledgeBase: emptyKb,
    tools: [],
    dynamicVariables: [
      { key: 'owner_name', label: 'Owner name', fieldDirection: 'infield', source: 'crm' },
    ],
  } as unknown as BusinessSpecification,
  transcript: [
    { role: 'user', content: 'Hinglish voice agent for Marg ERP to book online software demos with business owners.' },
  ],
  expect: {
    mustContain: ['Marg ERP'],
    mustNotContain: [/\b911\b/, /\b988\b/],
  },
};

/** Inbound, English, healthcare — regulated-adjacent, opposite call direction. */
const dentalInbound: DomainFixture = {
  id: 'dental_inbound',
  name: 'Dental Clinic Receptionist (Inbound)',
  spec: {
    meta: {
      companyName: 'Apex Dental Studio', agentName: 'Riya', industry: 'Healthcare',
      isRegulated: false, toneProfile: ['Professional'],
      primaryGoal: 'Book patient appointments and answer general clinic FAQs',
      languageMode: 'english', callDirection: 'inbound',
      aiDisclosure: 'disclose', agentGender: 'female', region: 'US',
    },
    businessSnapshot: {
      operatingHours: 'Mon-Fri 9 to 5',
      servicesOffered: ['Cleaning', 'X-Ray'],
      policies: { cancellation: '24 hours notice', refunds: 'No refunds after service', escalationNumbers: ['555-0100'] },
    },
    callFlowPlan: {
      requiredStages: [
        { id: 'greeting', label: 'Greeting' },
        { id: 'collect_booking', label: 'Collect booking details' },
        { id: 'close', label: 'Close' },
      ],
      steps: [
        st(1, 'greeting', 'Greeting', 'Greet the caller',
          `Say: "Thanks for calling Apex Dental Studio. I'm Riya, your AI assistant. How can I help today?"`, [], 2),
        st(2, 'collect_booking', 'Collect booking', 'Collect the appointment day',
          `Say: "Which day works best for you?"`, ['appointment_date'], 3),
        term(3, 'close', 'Close', 'Close the call',
          `Say: "You are all set. Thanks for calling, and see you soon!"`),
      ],
    },
    knowledgeBase: emptyKb,
    tools: [],
    dynamicVariables: [],
  } as unknown as BusinessSpecification,
  transcript: [
    { role: 'user', content: 'Inbound receptionist for Apex Dental Studio to book appointments and answer FAQs. English.' },
  ],
  expect: { mustContain: ['Apex Dental Studio'] },
};

export const DOMAIN_FIXTURES: DomainFixture[] = [vlccQatar, margErpHinglish, dentalInbound];
