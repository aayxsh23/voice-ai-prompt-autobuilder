import { NextResponse } from 'next/server';
import { compilePromptPackage } from '@/lib/pipeline/promptCompiler';
import { apiHandler, ApiError } from '@/lib/apiHandler';
import { rateLimit, clientKey } from '@/lib/rateLimit';
import { BusinessSpecification } from '@/lib/llm/types';
import { KnowledgeExtractor, EMPTY_KNOWLEDGE } from '@/lib/compiler/planners/KnowledgeExtractor';

/**
 * Barge-in is not configurable. Every prompt is compiled with interruption handling,
 * so this policy is a constant rather than a form field.
 */
const INTERRUPTION_POLICY =
  'Barge-in is ALWAYS enabled. Stop speaking the instant the caller starts talking — never talk over them and never finish the sentence you were on. ' +
  'Listen to the full interruption, respond to what they actually said, then resume from the exact point in the flow you left, without repeating what you already delivered. ' +
  'If the interruption was a correction, apply it before continuing. Never tell the caller to wait or to let you finish.';

const TONE_LABELS: Record<string, string[]> = {
  professional: ['Professional', 'Neutral'],
  friendly: ['Friendly', 'Warm', 'Conversational'],
  empathetic: ['Empathetic', 'Patient', 'Understanding'],
  authoritative: ['Confident', 'Direct'],
  casual: ['Casual', 'Relaxed'],
  persuasive: ['Persuasive', 'Enthusiastic'],
};

function resolveLanguageMode(primary: string, secondary: string): BusinessSpecification['meta']['languageMode'] {
  const isHinglish = 
    (primary === 'English' && secondary === 'Hindi') ||
    (primary === 'Hindi' && secondary === 'English');
    
  if (isHinglish) return 'hinglish';
  if (secondary && secondary !== 'None') return 'multilingual';
  if (primary === 'Hindi') return 'hindi';
  if (primary === 'Hinglish') return 'hinglish'; // Legacy fallback
  return 'english';
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);

/**
 * Turns the user's plain-language call-flow sketch into the mandatory stage list the
 * WorkflowArchitect must produce a state for. Without this the planner is free to
 * quietly drop a step the user wrote down.
 */
export function parseRequiredStages(callFlow: string): Array<{ id: string; label: string }> {
  return String(callFlow || '')
    .split('\n')
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').trim())
    .filter((l) => l.length > 2)
    .slice(0, 12)
    .map((label, i) => ({ id: slugify(label) || `stage_${i + 1}`, label }));
}

export const POST = apiHandler(async (req: Request) => {
  if (!rateLimit(`generate-review:${clientKey(req)}`, 10, 60_000)) {
    throw new ApiError(429, 'Too many requests. Please wait a moment and try again.');
  }

  const body = await req.json();
  const { form, clarifications, sessionId } = body;
  if (!form) throw new ApiError(400, 'Missing form data');

  const languageMode = resolveLanguageMode(form.primaryLanguage, form.secondaryLanguage);
  const primaryGoal = String(form.callPurpose || '').trim() || 'Assist callers';

  /* ── 1. Knowledge base → structured facts ───────────────────────────────
     The builder no longer asks for services, hours, addresses or written
     policies. Everything factual is extracted from the pasted knowledge base
     and filed into the section of the prompt where it belongs. */
  const knowledge = form.kbEnabled && String(form.kbContent || '').trim()
    ? await KnowledgeExtractor.extract(form.kbContent, {
        companyName: form.companyName,
        industry: form.industry,
        primaryGoal,
        languageMode,
      })
    : EMPTY_KNOWLEDGE;

  /* ── 2. Escalation targets ────────────────────────────────────────────── */
  const transferNumbers: Array<{ label: string; number: string }> = form.liveTransferEnabled
    ? (Array.isArray(form.transferNumbers) ? form.transferNumbers : []).filter((t: { number?: string }) => String(t?.number || '').trim())
    : [];

  /* ── 3. Operational protocols (rendered under BUSINESS CONTEXT) ───────── */
  const capturedTopics = [...knowledge.capturedTopics];
  if (form.liveTransferEnabled) {
    const triggers: string[] = Array.isArray(form.transferTriggers) ? form.transferTriggers : [];
    const parts = [
      triggers.length ? `Transfer to a human when: ${triggers.join('; ')}.` : 'Transfer to a human when the situation clearly exceeds the agent\'s scope.',
      transferNumbers.length ? `Available transfer targets: ${transferNumbers.map((t) => `${t.label || 'Transfer'} (${t.number})`).join(', ')}.` : '',
      String(form.afterHoursBehavior || '').trim() ? `If nobody can take the transfer: ${String(form.afterHoursBehavior).trim()}` : '',
    ].filter(Boolean);
    capturedTopics.push({ topic: 'Live transfer & escalation', summary: parts.join(' ') });
  }

  /* ── 4. Guardrails → hard prohibitions ────────────────────────────────── */
  const prohibitions = String(form.guardrails || '')
    .split('\n')
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 20);

  /* ── 5. Disclosures ───────────────────────────────────────────────────── */
  const disclosures: string[] = [];
  if (form.recordingConsent && String(form.disclosureText || '').trim()) {
    disclosures.push(String(form.disclosureText).trim());
  }

  const spec: BusinessSpecification = {
    meta: {
      companyName: String(form.companyName || '').trim() || 'Enterprise Client',
      agentName: String(form.agentName || '').trim() || 'Voice Assistant',
      industry: String(form.industry || '').trim() || 'General',
      isRegulated: ['Healthcare', 'Finance', 'Insurance'].includes(form.industry),
      toneProfile: TONE_LABELS[form.voiceTone] || TONE_LABELS.professional,
      primaryGoal,
      languageMode,
      callDirection: String(form.callDirection || 'Inbound').toLowerCase() === 'outbound' ? 'outbound' : 'inbound',
      openingPhrase: String(form.openingMessage || '').trim() || undefined,
      aiDisclosure: form.discloseAI ? 'disclose' : 'deny',
      recordingDisclosure: form.recordingConsent ? 'required' : 'none',
      voiceCharacteristics: { gender: form.voiceGender || 'Female' },
      ...(form.region ? { region: String(form.region).toUpperCase().slice(0, 2) } : {}),
    },
    businessSnapshot: {
      operatingHours: knowledge.operatingHours || 'Not specified — do not state hours you were not given',
      servicesOffered: knowledge.servicesOffered,
      policies: {
        cancellation: knowledge.policies.cancellation || 'None — not specified',
        refunds: knowledge.policies.refunds || 'None — not specified',
        escalationNumbers: transferNumbers.map((t) => `${t.label || 'Transfer'}: ${t.number}`),
        disclosures,
        otherPolicies: knowledge.policies.otherPolicies,
      },
    },
    callFlowPlan: {
      steps: [],
      // The user's plain-language sketch drives the planner; it is never rendered raw.
      script: String(form.callFlow || '').trim(),
      requiredStages: parseRequiredStages(form.callFlow),
      interruptionPolicy: INTERRUPTION_POLICY,
      digressionPolicy: String(form.digressionHandling || '').trim() || undefined,
      retryExhaustion: {
        afterRetries: Number(form.maxRetries) > 0 ? Number(form.maxRetries) : 2,
        action: String(form.retryFallback || 'Transfer to a human agent'),
      },
      // confirmationStyle is deliberately unset: the compiler decides which steps
      // need an explicit read-back from what the flow actually collects.
    },
    knowledgeBase: {
      faqs: knowledge.faqs,
      objections: knowledge.objections,
    },
    tools: [],
    capturedTopics,
    dynamicVariables: [],
    guardrails: prohibitions.length > 0 ? { prohibitions } : undefined,
    ...(transferNumbers.length > 0
      ? {
          extractedEntities: {
            departments: [],
            namedContacts: transferNumbers.map((t) => ({ label: t.label || 'Transfer', value: t.number })),
            servicesOrOfferings: knowledge.servicesOffered,
          },
        }
      : {}),
  };

  /* ── 6. Variables: pre-call context only ───────────────────────────────
     Anything the agent has to ASK for is derived by the WorkflowArchitect from
     the call flow — the form no longer collects an intake list. */
  const seenKeys = new Set<string>();
  (Array.isArray(form.variables) ? form.variables : []).forEach((v: { key?: string; value?: string }) => {
    const key = String(v?.key || '').trim().replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    if (!key || seenKeys.has(key)) return;
    seenKeys.add(key);
    spec.dynamicVariables!.push({
      key,
      label: String(v?.key || key),
      type: 'caller',
      fieldDirection: 'infield',
      required: false,
      source: 'crm',
      description: `Pre-call context supplied by the platform before the call starts${v?.value ? ` (e.g. "${v.value}")` : ''}`,
      defaultValue: '',
    });
  });

  /* ── 7. Judge clarifications ───────────────────────────────────────────
     Answers to the reviewer's questions are operational instructions, not FAQ
     content — they belong beside the other protocols, not in the caller-facing
     FAQ section. */
  if (clarifications && typeof clarifications === 'object') {
    Object.entries(clarifications as Record<string, string>).forEach(([question, answer]) => {
      const a = String(answer || '').trim();
      if (a) spec.capturedTopics!.push({ topic: question, summary: a });
    });
  }

  // languageMode is read off businessSpec.meta downstream — passing it again here
  // would only re-narrow it to the blueprint's older three-value union.
  const draft = await compilePromptPackage({ businessSpec: spec, sessionId });

  return NextResponse.json(draft);
});
