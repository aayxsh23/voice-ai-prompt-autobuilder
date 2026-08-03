import { NextResponse } from 'next/server';
import { llmClient } from '@/lib/llm/llmProvider';
import { safeParseJson } from '@/lib/llm/types';
import { apiHandler, ApiError } from '@/lib/apiHandler';
import { rateLimit, clientKey } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

type Field = 'openingMessage' | 'callFlow' | 'guardrails';
const VALID_FIELDS: Field[] = ['openingMessage', 'callFlow', 'guardrails'];

/**
 * Models routinely answer a "one rule per line" request with a JSON array — of
 * strings, or of little wrapper objects — instead of a newline-joined string. It is
 * the same content either way, so normalise it rather than silently dropping the
 * field and leaving the user with an input that mysteriously never fills in.
 */
export function coerceText(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (Array.isArray(v)) {
    return v
      .map((x) => {
        if (typeof x === 'string') return x.trim();
        if (x && typeof x === 'object') {
          const first = Object.values(x as Record<string, unknown>).find((val) => typeof val === 'string');
          return typeof first === 'string' ? first.trim() : '';
        }
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  return '';
}

const SPEC: Record<Field, string> = {
  openingMessage: `"openingMessage": the agent's first spoken line. ONE or TWO short sentences, phone-natural, no markdown. Name the agent and the company, and state why the call is happening (or, for inbound, invite the caller to state their need). Reference a declared variable as {{variable_name}} ONLY if it is in the variables list.`,
  callFlow: `"callFlow": a numbered plain-language sketch of the call, 4 to 8 lines, one goal per line, formatted "1. Greet and introduce yourself\\n2. ...". This is a sketch the USER reads to check the shape of the call — NOT a prompt. So: no "Say:" directives, no exact dialogue, no tool calls, no branching syntax, no state ids, no markdown. Short imperative phrases only. Always include a closing step.`,
  guardrails: `"guardrails": 4 to 6 enforceable rules, one per line, plain text, no bullets or numbering. Each must be specific to THIS business and checkable — a rule the agent could be caught breaking. Cover: what it must never promise or quote, what it must never claim to know, and at least one positive behaviour ("Always offer ... when ..."). Do NOT restate universal safety rules (self-harm, abuse, jailbreaks) — those are added by the compiler.`,
};

export const POST = apiHandler(async (req: Request) => {
  if (!rateLimit(`autofill:${clientKey(req)}`, 30, 60_000)) {
    throw new ApiError(429, 'Too many requests. Please wait a moment and try again.');
  }

  const body = await req.json().catch(() => ({}));
  const form = body?.form;
  const fields: Field[] = Array.isArray(body?.fields)
    ? body.fields.filter((f: unknown): f is Field => VALID_FIELDS.includes(f as Field))
    : [];

  if (!form || fields.length === 0) {
    throw new ApiError(400, 'Missing form data or fields');
  }
  if (!String(form.callPurpose || '').trim()) {
    throw new ApiError(400, 'A call purpose is required before drafting');
  }

  const variables = (Array.isArray(form.variables) ? form.variables : [])
    .map((v: { key?: string }) => String(v?.key || '').trim())
    .filter(Boolean);

  const isHinglish = 
    (form.primaryLanguage === 'English' && form.secondaryLanguage === 'Hindi') ||
    (form.primaryLanguage === 'Hindi' && form.secondaryLanguage === 'English');
    
  const usesHindi = form.primaryLanguage === 'Hindi' || form.primaryLanguage === 'Hinglish' || isHinglish;

  const languageNote = usesHindi
      ? `\nLANGUAGE: Write spoken lines in Devanagari script (देवनागरी). Keep English business terms (demo, software, billing, WhatsApp, email) in Roman script inside the sentence.`
      : `\nLANGUAGE: Write in natural conversational English.`;

  const prompt = `You are drafting the starting point for a voice AI agent's configuration, from the call purpose the user just wrote. The user will read and edit whatever you produce, so keep it plain and honest — never pad it to look thorough.

AGENT CONTEXT:
- Company: ${form.companyName || 'the company'}
- Agent name: ${form.agentName || 'the agent'}
- Industry: ${form.industry || 'not specified'}
- Call direction: ${form.callDirection || 'Inbound'} ${form.callDirection === 'Outbound' ? '(the agent calls the customer)' : '(the customer calls in)'}
- Tone: ${form.voiceTone || 'professional'}
- CALL PURPOSE: ${form.callPurpose}
${variables.length ? `- Pre-call variables available: ${variables.map((v: string) => `{{${v}}}`).join(', ')}` : '- No pre-call variables are declared.'}
${form.callFlow && !fields.includes('callFlow') ? `\nEXISTING CALL FLOW (align with it, do not contradict it):\n${form.callFlow}` : ''}
${form.guardrails && !fields.includes('guardrails') ? `\nEXISTING GUARDRAILS (align with them):\n${form.guardrails}` : ''}${languageNote}

RULES:
- Ground everything in the call purpose above. Never invent prices, hours, addresses, staff names, guarantees or policies.
- Barge-in is always enabled by the platform — never mention interruption handling.
- Do not write confirmation or read-back rules; the compiler decides those per step.

Return ONLY valid JSON with exactly these keys: ${fields.map((f) => `"${f}"`).join(', ')}.
${fields.map((f) => `- ${SPEC[f]}`).join('\n')}`;

  try {
    const response = await llmClient.generate({
      systemInstruction: 'You draft starting-point configuration for voice AI agents. Return ONLY valid JSON. Never invent business facts.',
      prompt,
      responseMimeType: 'application/json',
      contextLabel: 'builder-autofill',
    });

    const parsed = safeParseJson<Record<string, unknown>>(response.text, {});
    const out: Partial<Record<Field, string>> = {};
    for (const f of fields) {
      const val = coerceText(parsed[f]);
      if (val) out[f] = val;
    }
    return NextResponse.json(out);
  } catch (err) {
    // The user can always write these by hand — a failed draft is not a failed build.
    logger.warn('builder-autofill failed', err);
    throw new ApiError(503, 'Could not draft those fields right now.');
  }
});
