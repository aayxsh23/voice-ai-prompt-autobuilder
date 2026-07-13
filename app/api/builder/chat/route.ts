// app/api/builder/chat/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { llmClient as geminiClient } from '@/lib/llm/qwenProvider';
import { safeParseJson, BusinessSpecification } from '@/lib/llm/types';
import { CoverageArchitect } from '@/lib/compiler/blueprint/CoverageArchitect';
import { rateLimit, clientKey } from '@/lib/rateLimit';
import { detectAiDisclosure, detectAgentGender } from '@/lib/llm/language/personaExtract';

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
- meta (companyName, agentName, industry, isRegulated, toneProfile, primaryGoal, languageMode: string - e.g. 'english', 'hindi', or 'multilingual')
- businessSnapshot (operatingHours, servicesOffered, policies)
- extractedEntities (departments: string[], namedContacts: Array<{ label: string, value: string }>, servicesOrOfferings: string[])
- resolvedTopics (string[]: short snake_case tags of answered sub-topics, e.g. 'cancellation_policy', 'refund_policy', 'language_preference', 'digression_handling', 'silence_handling', 'interruption_policy', 'opening_phrase', 'closing_script')
- capturedTopics (Array<{ topic: string, summary: string }>: detailed operational or call flow answers that do not fit standard fields, e.g. digression handling, silence handling, emergency triage)
- dynamicVariables (Array<{ key: string, label: string, description: string, fieldDirection: 'infield' | 'outfield', required: boolean, source: string }>): extract any CRM/pre-call variables available before the call as 'infield' (source: 'crm') and any variables collected during the call as 'outfield' (source: 'extraction')

Do NOT include callFlowPlan, knowledgeBase, or tools in your output under any circumstances — those are generated later by a separate specialist process, not by you.
Only include a field if the user has explicitly and specifically stated it. Do not infer, invent, guess, or generalize values the user did not say.
For extractedEntities, only list entities the user explicitly named. Copy names and numbers verbatim as stated — do not paraphrase, generalize, or invent additional departments, contacts, or services beyond what was said.
If the user explicitly states that a policy does not exist (e.g. 'no policy', 'we don't have one', 'N/A'), write the literal string 'None — confirmed by business' for that field rather than omitting it or leaving it empty.
Whenever the user gives a substantive answer to a specific sub-topic (including when they confirm that no specific managers/departments are needed, refer to the team as a whole, or answer questions about call flow/conversational handling like digression_handling, silence_handling, interruption_policy, opening_phrase, closing_script, retry_exhaustion, confirmation_style, voice_persona, dtmf_fallback, holiday_hours, entry_routing, or injection_resistance), append a short snake_case tag for it to resolvedTopics (e.g. 'cancellation_policy', 'refund_policy', 'language_preference', 'staff_roster', 'team_structure', 'routing_protocol', 'qualification_criteria', 'objection_handling', 'digression_handling', 'silence_handling', 'interruption_policy', 'opening_phrase', 'closing_script', 'retry_exhaustion', 'confirmation_style', 'voice_persona', 'dtmf_fallback', 'holiday_hours', 'entry_routing', 'injection_resistance'). Do not repeat tags already present in the existing spec's resolvedTopics.
If the user gives a substantive, detailed operational or call flow answer that doesn't map cleanly to meta or businessSnapshot (e.g. after-hours routing, emergency triage protocol, referral handling, records handling, digression handling, silence handling, interruption behavior), append it to capturedTopics as { topic: short_snake_case_tag, summary: 2-4 sentence summary preserving key specifics like exact scripts, extensions, and thresholds }. Check existing capturedTopics first — do not add a duplicate topic tag.
Ensure you return valid JSON with no markdown fences.`;

    let updatedSpec: Partial<BusinessSpecification> = { ...existingSpec };
    try {
      const llmResponse = await geminiClient.generate({
        systemInstruction: "You are a pure JSON data extraction service. Output ONLY valid JSON.",
        prompt: patchPrompt
      });
      const patch = safeParseJson(llmResponse.text, {}) as Record<string, Record<string, unknown>>;
      if (patch && typeof patch === 'object') {
        delete patch.callFlowPlan;
        delete patch.knowledgeBase;
        delete patch.tools;

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
            steps: dedupeBy(
              [...(existingFlow?.steps || []), ...(patchFlow?.steps || [])],
              (s) => s.stateId || s.stateName || ''
            )
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
          dynamicVariables: dedupeBy(
            [...existingVars, ...patchVars],
            (v) => String(v?.key || '').trim().toLowerCase()
          )
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

    // Deterministically capture persona prefs the JSON-patch extraction misses:
    // whether the agent must NOT reveal it's an AI, and the agent's gender.
    const allUserText = messages
      .filter((m: { role: string; content: string }) => m.role.toLowerCase() === 'user')
      .map((m: { content: string }) => m.content)
      .join(' ');
    const disclosurePref = detectAiDisclosure(allUserText);
    if (disclosurePref) updatedSpec.meta!.aiDisclosure = disclosurePref;
    const genderPref = detectAgentGender(allUserText);
    if (genderPref) updatedSpec.meta!.agentGender = genderPref;

    const coverageReport = CoverageArchitect.evaluate(updatedSpec, messages);
    const reply = await CoverageArchitect.generateNextQuestion(coverageReport.missingFields, messages, updatedSpec, languageMode);

    const lastUserMsg = messages[messages.length - 1]?.content || "";
    const triggerGeneration = coverageReport.isReadyForCompilation;

    const result = {
      reply,
      isReadyToGenerate: coverageReport.isReadyForCompilation,
      triggerGeneration,
      missingDetails: coverageReport.missingFields,
      extractedBlueprint: {
        ...(currentBlueprint || {}),
        languageMode: languageMode || updatedSpec.meta?.languageMode || currentBlueprint?.languageMode || 'english',
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

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Error in /api/builder/chat:', error);
    // Do not leak internal error details to the client.
    return NextResponse.json({ error: 'Failed to process chat turn' }, { status: 500 });
  }
}
