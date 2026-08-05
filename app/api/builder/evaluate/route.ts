import { NextResponse } from 'next/server';
import { llmClient } from '@/lib/llm/llmProvider';
import { safeParseJson } from '@/lib/llm/types';
import { apiHandler, ApiError } from '@/lib/apiHandler';
import { rateLimit, clientKey } from '@/lib/rateLimit';

const MAX_QUESTIONS = 5;

export const POST = apiHandler(async (req: Request) => {
  if (!rateLimit(`evaluate:${clientKey(req)}`, 15, 60_000)) {
    throw new ApiError(429, 'Too many requests. Please wait a moment and try again.');
  }

  const { form, sessionId } = await req.json().catch(() => ({ form: null, sessionId: null }));
  if (!form) throw new ApiError(400, 'Missing form data');

  // Only what the judge can act on. Long free text is truncated so a pasted manual
  // does not crowd out the rest of the configuration.
  const kb = String(form.kbContent || '').trim();
  const review = {
    persona: {
      companyName: form.companyName,
      agentName: form.agentName,
      industry: form.industry,
      region: form.region || 'not specified',
      callDirection: form.callDirection,
      callPurpose: form.callPurpose,
      primaryLanguage: form.primaryLanguage,
      secondaryLanguage: form.secondaryLanguage,
      voiceGender: form.voiceGender,
      voiceTone: form.voiceTone,
    },
    conversation: {
      openingMessage: form.openingMessage,
      callFlow: form.callFlow,
      variables: (Array.isArray(form.variables) ? form.variables : [])
        .filter((v: { key?: string }) => String(v?.key || '').trim())
        .map((v: { key: string; value?: string }) => ({ key: v.key, sampleValue: v.value || '' })),
    },
    knowledgeBase: form.kbEnabled
      ? { provided: kb.length > 0, chars: kb.length, excerpt: kb.slice(0, 4000) }
      : { provided: false },
    guardrailsAndHandling: {
      guardrails: form.guardrails,
      discloseAI: form.discloseAI,
      recordingConsent: form.recordingConsent,
      disclosureText: form.disclosureText,
      digressionHandling: form.digressionHandling,
      retryFallback: form.retryFallback,
      maxRetries: form.maxRetries,
      liveTransferEnabled: form.liveTransferEnabled,
      transferNumbers: form.liveTransferEnabled ? form.transferNumbers : [],
      transferTriggers: form.transferTriggers,
      afterHoursBehavior: form.afterHoursBehavior,
    },
  };

  const prompt = `You are a critical Prompt Architect Judge reviewing a user's configuration for an AI voice agent, immediately before it is compiled into a production system prompt.

CONFIGURATION SUBMITTED:
\`\`\`json
${JSON.stringify(review, null, 2)}
\`\`\`

Find the gaps that would produce a WORSE agent if left unanswered, and ask about those only. Prioritise, in order:
1. A call flow step whose branching is undefined — what happens if the caller says no, is the wrong person, or wants something the flow does not cover.
2. Data the flow implies collecting but never says how to handle (invalid input, caller refuses, caller does not know).
3. A stated goal the configuration gives the agent no way to reach.
4. Facts the agent will certainly be asked for and has neither in the persona nor the knowledge base.
5. Contradictions between sections (e.g. guardrails forbid what the flow requires; transfer is enabled with no trigger; an outbound flow with no identity check).

DO NOT ASK ABOUT:
- Interruption, barge-in or talk-over handling — always enabled, not configurable.
- Confirmation, read-back or repeat-back style — decided per step by the compiler.
- Business address, phone number, website, staff rosters, opening hours, service lists or written policies — these come from the knowledge base, and their absence is expected.
- Anything already answered in the configuration above.
- Voice, tone, language, or anything cosmetic.

QUESTION STYLE: one concrete question per gap, answerable in a sentence by someone who runs this business — not a prompt-engineering question. Ask "What should the agent do if the caller says they already paid?", never "How would you like to handle the payment_status edge case?".

Ask AT MOST ${MAX_QUESTIONS} questions, fewer when fewer are warranted. If the configuration is genuinely sufficient to compile a production-grade prompt, return an empty array — do not manufacture questions.

Return ONLY valid JSON: { "questions": ["...", "..."] }`;

  try {
    const response = await llmClient.generate({
      systemInstruction: 'You are an expert AI voice agent architect reviewing a configuration. Return ONLY valid JSON.',
      prompt,
      responseMimeType: 'application/json',
      contextLabel: 'builder-evaluate',
      sessionId,
    });

    const parsed = safeParseJson<{ questions?: unknown }>(response.text, { questions: [] });
    const questions = (Array.isArray(parsed.questions) ? parsed.questions : [])
      .map((q) => (typeof q === 'string' ? q.trim() : ''))
      .filter(Boolean)
      .slice(0, MAX_QUESTIONS);

    return NextResponse.json({ questions });
  } catch {
    // A judge outage must not block the build — proceed straight to review.
    return NextResponse.json({ questions: [] });
  }
});
