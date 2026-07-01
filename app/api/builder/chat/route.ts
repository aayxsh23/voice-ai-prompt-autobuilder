// app/api/builder/chat/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { geminiClient } from '@/lib/llm/geminiProvider';
import { safeParseJson, BusinessSpecification } from '@/lib/llm/types';
import { CoverageArchitect } from '@/lib/compiler/blueprint/CoverageArchitect';

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
    const body = await req.json();
    const { messages, currentBlueprint, sessionId } = body;

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
- meta (companyName, agentName, industry, isRegulated, toneProfile, primaryGoal)
- businessSnapshot (operatingHours, servicesOffered, policies)
- extractedEntities (departments: string[], namedContacts: Array<{ label: string, value: string }>, servicesOrOfferings: string[])
- resolvedTopics (string[]: short snake_case tags of answered sub-topics, e.g. 'cancellation_policy', 'refund_policy')
- capturedTopics (Array<{ topic: string, summary: string }>: detailed operational answers that do not fit standard fields)

Do NOT include callFlowPlan, knowledgeBase, or tools in your output under any circumstances — those are generated later by a separate specialist process, not by you.
Only include a field if the user has explicitly and specifically stated it. Do not infer, invent, guess, or generalize values the user did not say.
For extractedEntities, only list entities the user explicitly named. Copy names and numbers verbatim as stated — do not paraphrase, generalize, or invent additional departments, contacts, or services beyond what was said.
If the user explicitly states that a policy does not exist (e.g. 'no policy', 'we don't have one', 'N/A'), write the literal string 'None — confirmed by business' for that field rather than omitting it or leaving it empty.
Whenever the user gives a substantive answer to a specific sub-topic, append a short snake_case tag for it to resolvedTopics (e.g. 'cancellation_policy', 'refund_policy'). Do not repeat tags already present in the existing spec's resolvedTopics.
If the user gives a substantive, detailed operational answer that doesn't map cleanly to meta or businessSnapshot (e.g. after-hours routing, emergency triage protocol, referral handling, records handling), append it to capturedTopics as { topic: short_snake_case_tag, summary: 2-4 sentence summary preserving key specifics like exact scripts, extensions, and thresholds }. Check existing capturedTopics first — do not add a duplicate topic tag.
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

        updatedSpec = {
          meta: { ...(existingSpec.meta || {}), ...(patch.meta || {}) } as BusinessSpecification['meta'],
          businessSnapshot: {
            ...existingSnap,
            ...patchSnap,
            policies: {
              ...(existingSnap.policies || {}),
              ...(patchSnap.policies || {})
            }
          } as BusinessSpecification['businessSnapshot'],
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

    const coverageReport = CoverageArchitect.evaluate(updatedSpec, messages);
    const reply = await CoverageArchitect.generateNextQuestion(coverageReport.missingFields, messages, updatedSpec);

    const lastUserMsg = messages[messages.length - 1]?.content || "";
    const userAgreed = /\b(yes|yeah|yep|generate|go ahead|ready|ok|okay|sure|let'?s do it|build|looks good|agree|proceed|create|split|finalize|done)\b/i.test(lastUserMsg.trim());
    const triggerGeneration = coverageReport.isReadyForCompilation && userAgreed;

    const result = {
      reply,
      isReadyToGenerate: coverageReport.isReadyForCompilation,
      triggerGeneration,
      missingDetails: coverageReport.missingFields,
      extractedBlueprint: {
        ...(currentBlueprint || {}),
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
    const errorMessage = error instanceof Error ? error.message : 'Failed to process chat turn';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
