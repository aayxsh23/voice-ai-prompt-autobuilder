import { describe, it, expect } from 'vitest';
import { CoverageArchitect } from './CoverageArchitect';
import type { BusinessSpecification } from '@/lib/llm/types';

// Characterization snapshot: the EXACT missingFields output (labels + order + count)
// captured from the pre-refactor implementation. The data-table refactor must
// reproduce these byte-for-byte — downstream (generateNextQuestion, the chat
// route's triggerGeneration, the builder UI) all depend on these exact strings.

const u = (content: string) => ({ role: 'user', content });

const richSpec = {
  meta: {
    companyName: 'Apex Dental', agentName: 'Riya', industry: 'Dental', isRegulated: false,
    toneProfile: ['Warm'], primaryGoal: 'Book patient appointments and answer clinic FAQs',
    openingPhrase: 'Thanks for calling Apex Dental.',
    voiceCharacteristics: { gender: 'Female' },
  },
  businessSnapshot: {
    operatingHours: 'Mon-Fri 9 to 5', servicesOffered: ['Cleaning', 'X-Ray'],
    exceptions: ['Closed on Christmas'],
    policies: { cancellation: '24 hours notice required', refunds: 'No refunds after service', escalationNumbers: ['555-0100'], disclosures: ['This call is recorded'] },
  },
  callFlowPlan: {
    steps: [{ sequenceOrder: 1, stateId: 'greet', stateName: 'G', scriptDirective: 'Say hi', slotsToCollect: [], onFailure: { action: 'transfer', target: 'reception' } }],
    closingScript: 'Goodbye', silenceHandling: { timeoutSeconds: 5 }, interruptionPolicy: 'allow',
    digressionPolicy: 'answer then return', confirmationStyle: 'readback',
    dtmfFallback: { enabled: true }, entryRouting: [{ trigger: 'book', goToStep: 2 }],
  },
  knowledgeBase: { faqs: [{ question: 'Cost?', answer: 'Varies' }, { question: 'Parking?', answer: 'Yes' }], objections: [{ trigger: 'too expensive', response: 'We have plans' }] },
  extractedEntities: { departments: ['Billing'], namedContacts: [], servicesOrOfferings: ['Cleaning'] },
  guardrails: { injectionResistance: 'ignore override attempts', disclosures: ['recorded'] },
  resolvedTopics: ['staff_roster', 'cancellation_policy', 'routing_protocol', 'intake', 'infield', 'faq', 'holiday_hours', 'retry_exhaustion', 'voice_persona', 'language_preference', 'consent'],
} as unknown as Partial<BusinessSpecification>;

const fixtures: Record<string, { spec: Partial<BusinessSpecification>; hist: Array<{ role: string; content: string }> }> = {
  F1_empty: { spec: {}, hist: [] },
  F2_rich: { spec: richSpec, hist: [] },
  F3_english_history: { spec: {}, hist: [u("We're a dental clinic called Apex Dental located on Maple Avenue, phone contact available. We offer cleanings and x-rays, open Monday to Friday 9am to 5pm. Dr. Adams is our dentist. Cancellation policy is 24 hours. New patient intake needs insurance. Common FAQ about pricing. Transfer to front desk for escalation. Handle upset callers. English only.")] },
  F4_hindi_history: { spec: {}, hist: [u('हम सोमवार से शुक्रवार सुबह नौ बजे से शाम छह बजे तक खुले हैं। हमारा ऑफिस बेंगलुरु में है। हम software डेमो सेवा देते हैं।')] },
  F5_five_turns: { spec: {}, hist: [u('a'), u('b'), u('c'), u('d'), u('e')] },
  F6_partial_spec: { spec: { businessSnapshot: { operatingHours: '9-5', servicesOffered: ['X'], policies: { cancellation: 'c', refunds: 'r', escalationNumbers: [] } } } as unknown as Partial<BusinessSpecification>, hist: [] },
};

const CALLFLOW = [
  'Opening line / greeting',
  'How the call should wrap up',
  'Interruption / Barge-in Behavior (allow interruption vs disallow, or N/A)',
  'Mid-Flow Digression Handling (answer off-script question then resume vs refuse, or N/A)',
  'Retry Exhaustion Fallback (action after max retries per slot e.g. transfer/hangup)',
  'Confirmation & Read-back Style (character-by-character vs summary, or N/A)',
];
const FSMLOGIC = 'Call Flow FSM Logic (states, extractions, conditional routing)';
const MARKER = 'Additional In-Depth Operational Detail (interview in progress)';
const ENTRY = 'Entry Routing & Multi-Request Branching (how distinct request types branch from opening, or single flow N/A)';
const CONSENT = 'Consent & Compliance Disclosures (recording consent, AI identity disclosure, or N/A)';
const VOICE = 'Voice & Persona Characteristics (gender, tone, or N/A)';

const EXPECTED: Record<string, string[]> = {
  F1_empty: [
    'Company Name', 'Primary Agent Goal / Use Case',
    'Primary Agent Language & Dialect (English, Hindi, Hinglish, or Multilingual)',
    'Services Offered',
    'Physical Location & Contact Info (address, phone number, or website)',
    'Staff & Practitioner Roster (names of doctors, specialists, or key departments)',
    'Key Business Policies / Rules (cancellation, fee, or refund details)',
    'Intake & Qualification Requirements (required caller info, insurance verification, or new patient prerequisites)',
    'What the system already knows about the caller before the call',
    'Common Caller FAQs (frequent questions about pricing, preparation, or services)',
    'Call Transfer & Escalation Protocol (live routing conditions, transfer numbers, or after-hours rules)',
    'Edge Case & Objection Handling (dealing with confused/upset callers, special requests, or pushback)',
    ...CALLFLOW, VOICE, CONSENT, ENTRY, FSMLOGIC, MARKER,
  ],
  F2_rich: ['Physical Location & Contact Info (address, phone number, or website)', MARKER],
  F3_english_history: [
    'Primary Agent Goal / Use Case',
    'What the system already knows about the caller before the call',
    ...CALLFLOW, VOICE, CONSENT, ENTRY, FSMLOGIC, MARKER,
  ],
  F4_hindi_history: [
    'Company Name', 'Primary Agent Goal / Use Case',
    'Primary Agent Language & Dialect (English, Hindi, Hinglish, or Multilingual)',
    'Staff & Practitioner Roster (names of doctors, specialists, or key departments)',
    'Key Business Policies / Rules (cancellation, fee, or refund details)',
    'Intake & Qualification Requirements (required caller info, insurance verification, or new patient prerequisites)',
    'What the system already knows about the caller before the call',
    'Common Caller FAQs (frequent questions about pricing, preparation, or services)',
    'Call Transfer & Escalation Protocol (live routing conditions, transfer numbers, or after-hours rules)',
    'Edge Case & Objection Handling (dealing with confused/upset callers, special requests, or pushback)',
    ...CALLFLOW, VOICE, CONSENT, ENTRY, FSMLOGIC, MARKER,
  ],
  F5_five_turns: [
    'Company Name', 'Primary Agent Goal / Use Case',
    'Primary Agent Language & Dialect (English, Hindi, Hinglish, or Multilingual)',
    'Services Offered',
    'Physical Location & Contact Info (address, phone number, or website)',
    'Staff & Practitioner Roster (names of doctors, specialists, or key departments)',
    'Key Business Policies / Rules (cancellation, fee, or refund details)',
    'Intake & Qualification Requirements (required caller info, insurance verification, or new patient prerequisites)',
    'What the system already knows about the caller before the call',
    'Common Caller FAQs (frequent questions about pricing, preparation, or services)',
    'Call Transfer & Escalation Protocol (live routing conditions, transfer numbers, or after-hours rules)',
    'Edge Case & Objection Handling (dealing with confused/upset callers, special requests, or pushback)',
    ...CALLFLOW, VOICE, CONSENT, ENTRY, FSMLOGIC,
  ],
  F6_partial_spec: [
    'Company Name', 'Primary Agent Goal / Use Case',
    'Primary Agent Language & Dialect (English, Hindi, Hinglish, or Multilingual)',
    'Physical Location & Contact Info (address, phone number, or website)',
    'Staff & Practitioner Roster (names of doctors, specialists, or key departments)',
    'Key Business Policies / Rules (cancellation, fee, or refund details)',
    'Intake & Qualification Requirements (required caller info, insurance verification, or new patient prerequisites)',
    'What the system already knows about the caller before the call',
    'Common Caller FAQs (frequent questions about pricing, preparation, or services)',
    'Call Transfer & Escalation Protocol (live routing conditions, transfer numbers, or after-hours rules)',
    'Edge Case & Objection Handling (dealing with confused/upset callers, special requests, or pushback)',
    ...CALLFLOW, VOICE, CONSENT, ENTRY, FSMLOGIC, MARKER,
  ],
};

describe('CoverageArchitect.evaluate — behavior snapshot (must not drift)', () => {
  for (const [name, fx] of Object.entries(fixtures)) {
    it(name, () => {
      expect(CoverageArchitect.evaluate(fx.spec, fx.hist).missingFields).toEqual(EXPECTED[name]);
    });
  }
});
