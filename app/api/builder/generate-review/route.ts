import { NextResponse } from 'next/server';
import { compilePromptPackage } from '@/lib/pipeline/promptCompiler';
import { apiHandler, ApiError } from '@/lib/apiHandler';
import { rateLimit, clientKey } from '@/lib/rateLimit';
import { BusinessSpecification } from '@/lib/llm/types';

export const POST = apiHandler(async (req: Request) => {
  if (!rateLimit(`generate-review:${clientKey(req)}`, 10, 60_000)) {
    throw new ApiError(429, 'Too many requests. Please wait a moment and try again.');
  }
  
  const body = await req.json();
  const { form, clarifications, sessionId, languageMode, overrides } = body;

  if (!form) {
    throw new ApiError(400, 'Missing form data');
  }

  // Construct BusinessSpecification from Form Data
  const businessSpec: BusinessSpecification = {
    meta: {
      companyName: form.companyName || 'Enterprise Client',
      agentName: form.agentName || 'Voice Assistant',
      callDirection: (form.callDirection?.toLowerCase() as any) || 'inbound',
      industry: 'General',
      isRegulated: false,
      primaryGoal: form.goalPreset === 'Other' ? form.goalOther : form.goalPreset,
      toneProfile: form.toneWords && form.toneWords.length > 0 ? form.toneWords : ["Professional"],
      languageMode: form.language === 'Multilingual' ? 'multilingual' : (form.language.toLowerCase() as any),
      aiDisclosure: form.aiDisclosure ? 'disclose' : 'deny',
      recordingDisclosure: form.recordingConsent ? 'required' : 'none',
      voiceCharacteristics: {
        gender: form.voiceGender,
      },
      openingPhrase: form.openingLine,
      terminalStates: [{ stateId: 'end_call', closingScript: form.closingScript }]
    },
    businessSnapshot: {
      operatingHours: form.isRemote ? 'Remote / No fixed hours' : 'Standard Business Hours',
      servicesOffered: form.services.map((s: any) => `${s.name}: ${s.desc}`),
      policies: {
        cancellation: form.policies.find((p: any) => p.type === 'Cancellation')?.desc || 'None',
        refunds: form.policies.find((p: any) => p.type === 'Refund')?.desc || 'None',
        escalationNumbers: form.transferNumbers.map((t: any) => `${t.label}: ${t.number}`),
        disclosures: form.disclosureText ? [form.disclosureText] : [],
        otherPolicies: form.policies
          .filter((p: any) => !['Cancellation', 'Refund'].includes(p.type))
          .filter((p: any) => p.desc?.trim())
          .map((p: any) => {
            const name = p.type === 'Other' && p.customType ? p.customType : p.type;
            return `${name}: ${p.desc}`;
          })
      }
    },
    callFlowPlan: { steps: [] },
    knowledgeBase: { faqs: [], objections: [] },
    tools: [],
    dynamicVariables: []
  };

  // Add intake and preCall fields as dynamic variables
  form.preCallFields.forEach((field: string) => {
    businessSpec.dynamicVariables?.push({
      key: field.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase(),
      label: field,
      type: 'caller',
      fieldDirection: 'infield',
      required: false,
      source: 'system',
      description: `Pre-call known context: ${field}`,
      defaultValue: ''
    });
  });

  form.intakeReqs.forEach((req: string) => {
    const mode = form.intakeModes?.[req] === 'verify' ? 'Verify' : 'Collect';
    businessSpec.dynamicVariables?.push({
      key: req.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase(),
      label: req,
      type: 'caller',
      fieldDirection: 'outfield',
      required: true,
      source: 'extraction',
      description: `${mode} from caller: ${req}`,
      defaultValue: ''
    });
  });

  // Map phoneCode to Region
  const REGION_MAP: Record<string, string> = {
    '+1': 'US',
    '+44': 'GB',
    '+91': 'IN',
    '+61': 'AU',
    '+81': 'JP',
    '+49': 'DE',
    '+33': 'FR',
    '+39': 'IT',
    '+34': 'ES',
    '+55': 'BR',
    '+52': 'MX',
    '+27': 'ZA',
    '+971': 'AE',
    '+966': 'SA',
    '+974': 'QA',
    '+65': 'SG',
    '+60': 'MY',
    '+63': 'PH',
    '+62': 'ID',
    '+64': 'NZ',
    '+86': 'CN',
    '+82': 'KR',
  };
  
  if (form.phoneCode && REGION_MAP[form.phoneCode]) {
    businessSpec.meta.region = REGION_MAP[form.phoneCode];
  }

  // Handle hardcoded Address, Phone, Website
  if (!form.isRemote && form.address) {
    businessSpec.businessSnapshot.policies.disclosures?.push(`Physical Address: ${form.address}`);
  }
  
  const fullPhone = form.phone ? `${form.phoneCode} ${form.phone}` : '';
  if (fullPhone) businessSpec.businessSnapshot.policies.disclosures?.push(`Phone Number: ${fullPhone}`);
  if (form.website) businessSpec.businessSnapshot.policies.disclosures?.push(`Website: ${form.website}`);

  // Add FAQs from the large text block and clarifications
  if (form.faqsText) {
    businessSpec.knowledgeBase.faqs.push({
      question: 'General Knowledge and FAQs',
      answer: form.faqsText
    });
  }
  if (clarifications && Object.keys(clarifications).length > 0) {
    Object.values(clarifications).forEach((ans: any, idx: number) => {
      businessSpec.knowledgeBase.faqs.push({
        question: `Clarification ${idx + 1}`,
        answer: ans as string
      });
    });
  }

  let confirmationMechanics = 'No explicit confirmation required';
  if (form.needsConfirmation) {
    confirmationMechanics = `Needs to confirm: ${form.confirmationScope}. Style: ${form.confirmationStyle}`;
  }

  // Handle flow mechanics
  businessSpec.meta.primaryGoal += `\n\nCall flow mechanics:\n- Interruption: ${form.interruption ? 'Allowed' : 'Disallowed'}\n- Digression: ${form.digression}\n- Retry fallback: ${form.retryFallback} after ${form.maxRetries} retries\n- Confirmation: ${confirmationMechanics}\n\nCall flow description:\n${form.callFlowDescription}`;

  const compilePayload = {
    businessSpec,
    languageMode: languageMode || 'english',
    overrides: overrides || { faqPairs: [], objectionPairs: [], verbatimLines: [], transferRules: [] },
    sessionId
  };

  const draft = await compilePromptPackage(compilePayload);
  return NextResponse.json(draft);
});
