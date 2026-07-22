import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { llmClient as geminiClient } from '@/lib/llm/qwenProvider';
import { safeParseJson, BusinessSpecification } from '@/lib/llm/types';
import { CoverageArchitect } from '@/lib/compiler/blueprint/CoverageArchitect';
import { rateLimit, clientKey } from '@/lib/rateLimit';
import { detectAiDisclosure, detectAgentGender } from '@/lib/llm/language/personaExtract';
import { isInstructionLike } from '@/lib/pipeline/dialogue/dialogueLint';
import { semanticDedupSlots } from '@/lib/compiler/assembler/PromptAssembler';

type CallFlowPolicy = Partial<Pick<BusinessSpecification['callFlowPlan'],
  'interruptionPolicy' | 'digressionPolicy' | 'confirmationStyle' |
  'dtmfFallback' | 'closingScript' | 'retryExhaustion'>>;

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

function sanitizeCallFlowPolicy(raw: unknown): CallFlowPolicy {
  const src = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw as Record<string, unknown> : {};
  const out: CallFlowPolicy = {};

  if (isNonEmptyString(src.interruptionPolicy)) out.interruptionPolicy = src.interruptionPolicy.trim();
  if (isNonEmptyString(src.digressionPolicy)) out.digressionPolicy = src.digressionPolicy.trim();
  if (isNonEmptyString(src.confirmationStyle)) out.confirmationStyle = src.confirmationStyle.trim();

  const dtmf = src.dtmfFallback as { enabled?: unknown } | undefined;
  if (dtmf && typeof dtmf === 'object' && typeof dtmf.enabled === 'boolean') {
    out.dtmfFallback = { enabled: dtmf.enabled };
  }

  if (isNonEmptyString(src.closingScript) && !isInstructionLike(src.closingScript)) {
    out.closingScript = src.closingScript.trim();
  }

  const retry = src.retryExhaustion as { afterRetries?: unknown; action?: unknown } | undefined;
  if (retry && typeof retry === 'object') {
    const r: NonNullable<CallFlowPolicy['retryExhaustion']> = {};
    if (typeof retry.afterRetries === 'number') r.afterRetries = retry.afterRetries;
    if (isNonEmptyString(retry.action)) r.action = retry.action.trim();
    if (Object.keys(r).length > 0) out.retryExhaustion = r;
  }
  return out;
}

function sanitizeRequiredStages(raw: unknown): Array<{ id: string; label: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => {
      const o = s as { id?: unknown; label?: unknown };
      const id = isNonEmptyString(o?.id) ? o.id.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') : '';
      if (!id) return null;
      return { id, label: isNonEmptyString(o?.label) ? o.label.trim() : id.replace(/_/g, ' ') };
    })
    .filter((s): s is { id: string; label: string } => s !== null);
}

function dedupeBy<T>(arr: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of arr) {
    if (!item) continue;
    const key = keyFn(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

function canonicalizeVars(vars: any[]): any[] {
  if (!vars || vars.length === 0) return [];
  const validVars = vars.filter(v => v && v.key);
  const allKeys = validVars.map(v => v.key);
  const dedupedKeys = new Set(semanticDedupSlots(allKeys));
  
  const result: any[] = [];
  const seen = new Set<string>();
  
  for (const v of validVars) {
    if (dedupedKeys.has(v.key) && !seen.has(v.key)) {
      seen.add(v.key);
      result.push(v);
    }
  }
  return result;
}

export async function POST(req: Request) {
  try {
    if (!rateLimit(`builder-chat:${clientKey(req)}`, 30, 60_000)) {
      return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 });
    }
    const body = await req.json();
    const { messages, currentBlueprint, sessionId, languageMode } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 });
    }

    let existingSpec: Partial<BusinessSpecification> = currentBlueprint?.businessSpec || {};

    if (sessionId) {
      try {
        const session = await prisma.builderSession.findUnique({ where: { id: sessionId } });
        if (session?.businessSpec && session.businessSpec !== '{}') {
          const parsed = JSON.parse(session.businessSpec);
          existingSpec = { ...parsed, ...existingSpec };
        }
      } catch {
        // Ignore DB session lookup failure
      }
    }

    const historyText = messages.map((m: { role: string; content: string }) => `${m.role.toUpperCase()}: ${m.content}`).join('\n');

    const patchPrompt = `You are a data extraction specialist. Read the conversation history. Output a JSON patch to update the BusinessSpecification.
Do not write conversational prose.

Current BusinessSpecification JSON (context only — do not repeat or restate unrelated sections):
${JSON.stringify({ meta: existingSpec.meta, businessSnapshot: existingSpec.businessSnapshot, extractedEntities: existingSpec.extractedEntities, resolvedTopics: existingSpec.resolvedTopics, capturedTopics: existingSpec.capturedTopics }, null, 2)}

Conversation History:
${historyText}

Output ONLY a JSON object with these top-level keys:
- meta (companyName, agentName, industry, isRegulated, toneProfile, primaryGoal, languageMode: string - e.g. 'english', 'hindi', 'hinglish', or 'multilingual', aiDisclosure: 'disclose' | 'deny', recordingDisclosure: 'required' | 'none', openingPhrase: string, agentGender: 'female' | 'male', callDirection: 'inbound' | 'outbound', scopeExclusions: string[], terminalStates: Array<{ stateId: string, label: string, closingScript?: string }>)
- businessSnapshot (operatingHours, servicesOffered, policies)
- extractedEntities (departments: string[], namedContacts: Array<{ label: string, value: string }>, servicesOrOfferings: string[])
- resolvedTopics (string[]: short snake_case tags of answered sub-topics, e.g. 'cancellation_policy', 'refund_policy', 'language_preference', 'digression_handling', 'silence_handling', 'interruption_policy', 'opening_phrase', 'closing_script')
- capturedTopics (Array<{ topic: string, summary: string }>: detailed operational or call flow answers that do not fit standard fields, e.g. digression handling, silence handling, emergency triage)
- dynamicVariables (Array<{ key: string, label: string, description: string, fieldDirection: 'infield' | 'outfield', required: boolean, source: string }>): extract any CRM/pre-call variables available before the call as 'infield' (source: 'crm') and any variables collected during the call as 'outfield' (source: 'extraction')
- callFlowPolicy (object): ONLY the conversational policies the user explicitly stated. Omit any key they did not answer. Never invent values.
  - silenceHandling: { timeoutSeconds: number, action: string (what the agent says/does), maxReprompts: number }
  - interruptionPolicy: string (barge-in allowed or not)
  - digressionPolicy: string (answer-then-return vs refuse; how many redirects)
  - confirmationStyle: string (read-back style)
  - dtmfFallback: { enabled: boolean }  — set enabled:false if the user said voice-only
  - closingScript: string — ONLY if the user gave the exact words to speak. If they described what the closing should DO rather than the words, omit this.
  - openingPhrase: string — ONLY if the user gave the exact words to speak.
  - retryExhaustion: { afterRetries: number, action: string } (what happens once retries run out)
- requiredStages (Array<{ id: string (snake_case), label: string }>): the ordered call-flow stages the user described (e.g. opening, cross_sell_pitch, offer_consultation, collect_booking, readback, close). Extract ONLY stages the user actually described, in the order they described them. If they described no stages, omit this key entirely. Do NOT invent a generic stage list.
- callFlowScript (string): If the user explicitly defines a detailed, multi-step sequence, script, or state machine in their message (including branching conditions, spoken actions, or rules), extract their exact verbatim text for that section into this field. If they just mention simple stages, omit this.

Do NOT include callFlowPlan.steps, knowledgeBase, or tools in your output under any circumstances — those are generated later by a separate specialist process, not by you. (callFlowPolicy, callFlowScript, and requiredStages above ARE yours to extract — they capture what the user told you, not a designed flow.)
For closingScript and openingPhrase, remember these are LITERAL SPOKEN WORDS. If the user said "read back the details and say goodbye", that is an instruction, not a script — omit the key rather than storing the instruction.
Only include a field if the user has explicitly and specifically stated it. Do not infer, invent, guess, or generalize values the user did not say.
For meta:
- aiDisclosure: set to 'deny' if the user requests not revealing or disclosing that the agent is an AI/bot, or 'disclose' if they say to disclose it.
- recordingDisclosure: set to 'required' if the user explicitly asks to state that the call is being recorded, otherwise 'none'.
- openingPhrase: extract verbatim when the user provides a fixed or verbatim opening greeting/script.
- agentGender: extract 'female' or 'male' if persona/gender is specified.
- callDirection: extract 'inbound' or 'outbound' from the workflow description.
- scopeExclusions: list any explicit 'out of scope' or 'not provided' topics (e.g. cancellation policy, refunds, live transfer).
- terminalStates: list any distinct end-of-call closure outcomes specified by the user (e.g. training slot scheduled, not using software, billing issue logged, callback requested).
For extractedEntities, only list entities the user explicitly named. Copy names and numbers verbatim as stated — do not paraphrase, generalize, or invent additional departments, contacts, or services beyond what was said.
If the user explicitly states that a policy does not exist (e.g. 'no policy', 'we don't have one', 'N/A'), write the literal string 'None — confirmed by business' for that field rather than omitting it or leaving it empty.
If the user defines any pre-call CRM variables (infields), fixed session input fields, parameters, or data collected during the call (outfields), or answers what data is passed before the call (such as Company Name, Caller Name, Order ID, or confirms only certain variables or no variables are passed), populate dynamicVariables in the spec with items having key, label, type ('business'|'caller'|'task'|'runtime'), fieldDirection ('infield'|'outfield'), required, defaultValue, source ('crm'|'runtime'), and description. CRITICAL NAMING RULE: All variable keys (key), slot names, and infield/outfield names MUST be under 2 words max (separated by single underscores, e.g. 'phone_number', 'booking_date', 'caller_name', 'first_name', 'order_id'). Names with 3 or more words like 'customer_phone_number', or 'preferred_appointment_time' are strictly forbidden and NOT allowed! Always shorten any 3+ word variable or slot name to at most 2 words (e.g. use 'phone_number' instead of 'customer_phone_number'). EXCEPTION: The variables 'current_day', 'current_date', and 'current_time' are reserved system variables. They MUST NOT be shortened, renamed, or modified under any circumstances.
Whenever the user answers a question about a specific sub-topic (EVEN if their answer is short, negative, declining, or stating that something is not applicable/not used — such as answering "No", "No such Holidays", "No details like these shared during call", "No it doesnt reference any name during cals", "None needed", "Not required", or confirming that no specific staff/departments/roster or transfers are needed), you MUST append a short snake_case tag for that topic to resolvedTopics (e.g. 'primary_goal', 'company_name', 'staff_roster', 'staff', 'team_structure', 'holiday_hours', 'routing_protocol', 'dtmf_fallback', 'infields', 'cancellation_policy', 'refund_policy', 'language_preference', 'qualification_criteria', 'objection_handling', 'digression_handling', 'silence_handling', 'interruption_policy', 'opening_phrase', 'closing_script', 'retry_exhaustion', 'confirmation_style', 'voice_persona', 'entry_routing', 'injection_resistance'). This is vital so the system knows the topic was answered and never asks the user about it again. Do not repeat tags already present in the existing spec's resolvedTopics.
If the user gives a substantive, detailed operational or call flow answer that doesn't map cleanly to meta or businessSnapshot (e.g. after-hours routing, emergency triage protocol, referral handling, records handling, digression handling, silence handling, interruption behavior), append it to capturedTopics as { topic: short_snake_case_tag, summary: 2-4 sentence summary preserving key specifics like exact scripts, extensions, and thresholds }. Check existing capturedTopics first — do not add a duplicate topic tag.
If the conversation history contains an 'AUDIT FIX REQUEST:', extract and apply every requested fix instruction to the corresponding fields in meta, businessSnapshot, resolvedTopics, or capturedTopics.
Ensure you return valid JSON with no markdown fences.`;

    let updatedSpec: Partial<BusinessSpecification> = { ...existingSpec };
    try {
      const llmResponse = await geminiClient.generate({
        systemInstruction: "You are a pure JSON data extraction service. Output ONLY valid JSON.",
        prompt: patchPrompt
      });
      const patch = safeParseJson(llmResponse.text, {}) as Record<string, Record<string, unknown>>;
      if (patch && typeof patch === 'object') {
        const patchPolicy = sanitizeCallFlowPolicy(patch.callFlowPolicy);
        const patchStages = sanitizeRequiredStages(patch.requiredStages);
        const patchScript = patch.callFlowScript || (patch.callFlowPlan as any)?.script;
        
        delete patch.callFlowPlan;
        delete patch.knowledgeBase;
        delete patch.tools;
        delete patch.callFlowPolicy;
        delete patch.requiredStages;
        delete patch.callFlowScript;

        const existingFlow = existingSpec.callFlowPlan as BusinessSpecification['callFlowPlan'] | undefined;
        const patchFlow = patch.callFlowPlan as unknown as BusinessSpecification['callFlowPlan'] | undefined;
        const existingKB = existingSpec.knowledgeBase as BusinessSpecification['knowledgeBase'] | undefined;
        const patchKB = patch.knowledgeBase as unknown as BusinessSpecification['knowledgeBase'] | undefined;
        const existingTools = existingSpec.tools as BusinessSpecification['tools'] | undefined;
        const patchTools = patch.tools as unknown as BusinessSpecification['tools'] | undefined;
        const existingEntities = existingSpec.extractedEntities || { departments: [], namedContacts: [], servicesOrOfferings: [] };
        const patchEntities = (patch.extractedEntities as unknown as BusinessSpecification['extractedEntities']) || { departments: [], namedContacts: [], servicesOrOfferings: [] };
        const existingSnap = existingSpec.businessSnapshot || {} as BusinessSpecification['businessSnapshot'];
        const patchSnap = (patch.businessSnapshot as unknown as BusinessSpecification['businessSnapshot']) || {} as BusinessSpecification['businessSnapshot'];
        const existingResolved = existingSpec.resolvedTopics || [];
        const patchResolved = (patch.resolvedTopics as unknown as string[]) || [];
        const existingCaptured = existingSpec.capturedTopics || [];
        const patchCaptured = (patch.capturedTopics as unknown as Array<{ topic: string; summary: string }>) || [];
        const existingVars = existingSpec.dynamicVariables || [];
        const patchVars = (patch.dynamicVariables as unknown as Array<any>) || [];

        const isValEmpty = (v: unknown): boolean => {
          if (v === null || v === undefined) return true;
          if (typeof v === 'string' && v.trim() === '') return true;
          if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0) return true;
          if (Array.isArray(v) && v.length === 0) return true;
          return false;
        };

        const safePatch = <T extends Record<string, any>>(oldObj: T = {} as T, newObj: Record<string, any> = {}): T => {
          const res: Record<string, any> = { ...oldObj };
          for (const key of Object.keys(newObj)) {
            const newVal = newObj[key];
            if (!isValEmpty(newVal)) {
              if (typeof newVal === 'object' && !Array.isArray(newVal) && res[key] && typeof res[key] === 'object' && !Array.isArray(res[key])) {
                res[key] = safePatch(res[key], newVal);
              } else {
                res[key] = newVal;
              }
            }
          }
          return res as T;
        };

        updatedSpec = {
          meta: {
            ...(safePatch(existingSpec.meta || {}, patch.meta || {}) as BusinessSpecification['meta']),
            languageMode: (patch.meta?.languageMode as any) || languageMode || existingSpec.meta?.languageMode || currentBlueprint?.languageMode || 'english'
          },
          businessSnapshot: safePatch(existingSnap, patchSnap) as BusinessSpecification['businessSnapshot'],
          callFlowPlan: {
            ...(existingFlow || {}),
            steps: dedupeBy(
              [...(existingFlow?.steps || []), ...(patchFlow?.steps || [])],
              (s) => s.stateId || s.stateName || ''
            ),
            script: patchScript || existingFlow?.script,
            ...patchPolicy,
            ...(patchStages.length > 0 || existingFlow?.requiredStages
              ? { 
                  requiredStages: (() => {
                    const combined = [...(existingFlow?.requiredStages || []), ...patchStages].filter(s => s && s.id);
                    const allIds = combined.map(s => s.id);
                    const dedupedIds = new Set(semanticDedupSlots(allIds));
                    const result = [];
                    const seen = new Set<string>();
                    for (const s of combined) {
                      if (dedupedIds.has(s.id) && !seen.has(s.id)) {
                        seen.add(s.id);
                        result.push(s);
                      }
                    }
                    return result.slice(0, 8);
                  })()
                }
              : {}),
          },
          knowledgeBase: {
            faqs: dedupeBy(
              [...(existingKB?.faqs || []), ...(patchKB?.faqs || [])],
              (f) => String(f.question || '').trim().toLowerCase()
            ),
            objections: dedupeBy(
              [...(existingKB?.objections || []), ...(patchKB?.objections || [])],
              (o) => String(o.trigger || '').trim().toLowerCase()
            )
          },
          tools: dedupeBy(
            [...(existingTools || []), ...(patchTools || [])],
            (t) => t.name || ''
          ),
          extractedEntities: {
            departments: dedupeBy(
              [...(existingEntities.departments || []), ...(patchEntities.departments || [])],
              (d) => String(d || '').trim().toLowerCase()
            ),
            namedContacts: dedupeBy(
              [...(existingEntities.namedContacts || []), ...(patchEntities.namedContacts || [])],
              (c) => String(c.label || '').trim().toLowerCase()
            ),
            servicesOrOfferings: dedupeBy(
              [...(existingEntities.servicesOrOfferings || []), ...(patchEntities.servicesOrOfferings || [])],
              (s) => String(s || '').trim().toLowerCase()
            )
          },
          resolvedTopics: dedupeBy(
            [...existingResolved, ...patchResolved],
            (t) => String(t || '').trim().toLowerCase()
          ),
          capturedTopics: dedupeBy(
            [...existingCaptured, ...patchCaptured],
            (c) => String(c?.topic || '').trim().toLowerCase()
          ),
          dynamicVariables: canonicalizeVars([...existingVars, ...patchVars])
        };
      }
    } catch (llmErr) {
      console.warn("Business Architect AI patch extraction failed:", llmErr);
    }

    if (sessionId) {
      try {
        await prisma.builderSession.update({
          where: { id: sessionId },
          data: { businessSpec: JSON.stringify(updatedSpec) }
        });
      } catch {
        // Ignore DB update failure if session doesn't exist yet
      }
    }

    if (!updatedSpec.meta) updatedSpec.meta = {} as any;
    if (languageMode) updatedSpec.meta!.languageMode = languageMode;

    const allUserText = messages
      .filter((m: { role: string; content: string }) => m.role.toLowerCase() === 'user')
      .map((m: { content: string }) => m.content)
      .join(' ');
    const disclosurePref = detectAiDisclosure(allUserText);
    if (disclosurePref) updatedSpec.meta!.aiDisclosure = disclosurePref;
    const genderPref = detectAgentGender(allUserText);
    if (genderPref) updatedSpec.meta!.agentGender = genderPref;

    const opening = updatedSpec.meta!.openingPhrase;
    if (typeof opening === 'string' && isInstructionLike(opening)) {
      console.warn('[builder/chat] discarding openingPhrase that is an instruction, not speech:', opening);
      delete updatedSpec.meta!.openingPhrase;
    }

    const userTurns = messages.filter((m: { role: string }) => m.role.toLowerCase() === 'user').length;

    if (!updatedSpec.meta!.notApplicableTopics && userTurns >= 2) {
      try {
        const na = await CoverageArchitect.selectNotApplicableTopics(updatedSpec, messages);
        updatedSpec.meta!.notApplicableTopics = na;
      } catch {
        updatedSpec.meta!.notApplicableTopics = [];
      }
    }

    let coverageReport = CoverageArchitect.evaluate(updatedSpec, messages);

    if (coverageReport.isReadyForCompilation) {
      const unanswered = await CoverageArchitect.adjudicateCoverage(updatedSpec, messages, coverageReport.missingFields);
      if (unanswered.length > 0) {
        console.warn('[builder/chat] coverage adjudicator reopened topics the rules marked answered:', unanswered);
        coverageReport = { missingFields: unanswered, isReadyForCompilation: false };
      }
    }

    const resolvedLanguageMode = (updatedSpec.meta?.languageMode as 'english' | 'hindi' | 'multilingual' | undefined) || languageMode;
    const reply = await CoverageArchitect.generateNextQuestion(coverageReport.missingFields, messages, updatedSpec, resolvedLanguageMode);

    const triggerGeneration = coverageReport.isReadyForCompilation;

    const result = {
      reply,
      isReadyToGenerate: coverageReport.isReadyForCompilation,
      triggerGeneration,
      missingDetails: coverageReport.missingFields,
      extractedBlueprint: {
        ...(currentBlueprint || {}),
        languageMode: languageMode || updatedSpec.meta?.languageMode || currentBlueprint?.languageMode || 'english',
        dynamicVariables: updatedSpec.dynamicVariables || [], // Ensure dynamic variables are natively surfaced
        businessSpec: updatedSpec,
        business: {
          ...(currentBlueprint?.business || {}),
          companyName: updatedSpec.meta?.companyName || currentBlueprint?.business?.companyName || "Enterprise Client",
          businessName: updatedSpec.meta?.companyName || currentBlueprint?.business?.businessName || "Enterprise Client",
          description: updatedSpec.meta?.primaryGoal || currentBlueprint?.business?.description || ""
        },
        mission: {
          ...(currentBlueprint?.mission || {}),
          primaryGoal: updatedSpec.meta?.primaryGoal || currentBlueprint?.mission?.primaryGoal || ""
        },
        personality: {
          ...(currentBlueprint?.personality || {}),
          tone: updatedSpec.meta?.toneProfile?.[0] || "Professional"
        }
      }
    };

    if (sessionId) {
      try {
        await prisma.builderSession.update({
          where: { id: sessionId },
          data: {
            messagesJson: JSON.stringify(messages),
            businessSpec: JSON.stringify(updatedSpec)
          }
        });
      } catch (dbErr) {
        // Ignore DB update error
      }
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Error in /api/builder/chat:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to process chat turn';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
