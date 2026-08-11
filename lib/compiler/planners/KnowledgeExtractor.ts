import { llmClient } from "@/lib/llm/llmProvider";
import { safeParseJson } from "@/lib/llm/types";
import { logger } from "@/lib/logger";

/**
 * Structured facts pulled out of the raw knowledge base the user pastes in the
 * builder. These are exactly the fields the builder form used to ask for one by
 * one (services, hours, policies) plus the FAQ/objection content — the form now
 * asks for none of it, so this pass is the only thing that populates them.
 *
 * Everything is optional: an empty result is valid and simply means the compiled
 * prompt stays generic rather than inventing facts.
 */
export interface ExtractedKnowledge {
  operatingHours: string;
  servicesOffered: string[];
  policies: {
    cancellation: string;
    refunds: string;
    otherPolicies: string[];
  };
  /** Non-FAQ operational detail (locations, certifications, troubleshooting runbooks). */
  capturedTopics: Array<{ topic: string; summary: string }>;
  faqs: Array<{ question: string; answer: string }>;
  objections: Array<{ trigger: string; response: string }>;
  troubleshootingSteps: Array<{ problem: string; steps: string[] }>;
  competitorComparisons: Array<{ competitor: string; differentiation: string }>;
  guardrails: string[];
}

export const EMPTY_KNOWLEDGE: ExtractedKnowledge = {
  operatingHours: '',
  servicesOffered: [],
  policies: { cancellation: '', refunds: '', otherPolicies: [] },
  capturedTopics: [],
  faqs: [],
  objections: [],
  troubleshootingSteps: [],
  competitorComparisons: [],
  guardrails: [],
};

/** Guards against a pasted 200-page manual blowing the model's context. */
const MAX_INPUT_CHARS = 24_000;

/**
 * Tolerates the model returning `["Refunds: 30 days"]` or `[{ name, text }]` for the
 * same list — dropping a whole policy because it arrived wrapped in an object is a
 * silent data loss the user has no way to notice.
 */
const asStringArray = (v: unknown, cap: number): string[] =>
  (Array.isArray(v) ? v : [])
    .map((x) => {
      if (typeof x === 'string') return x.trim();
      if (x && typeof x === 'object') {
        const vals = Object.values(x as Record<string, unknown>).filter((val): val is string => typeof val === 'string');
        return vals.join(': ').trim();
      }
      return '';
    })
    .filter(Boolean)
    .slice(0, cap);

export class KnowledgeExtractor {
  public static async extract(
    rawKnowledge: string,
    context: { companyName?: string; industry?: string; primaryGoal?: string; languageMode?: string },
  ): Promise<ExtractedKnowledge> {
    const source = (rawKnowledge || '').trim();
    if (!source) return EMPTY_KNOWLEDGE;

    const truncated = source.length > MAX_INPUT_CHARS;
    const body = truncated ? source.slice(0, MAX_INPUT_CHARS) : source;
    if (truncated) {
      logger.warn('KnowledgeExtractor: knowledge base truncated', { originalChars: source.length, keptChars: MAX_INPUT_CHARS });
    }

    const isHindi = context.languageMode === 'hindi' || context.languageMode === 'hinglish';
    const langDirective = isHindi
      ? `\nLANGUAGE: Write every 'answer' and 'response' in Devanagari script (देवनागरी). Keep English business terms (demo, software, billing, WhatsApp, email) in Roman script inside the Devanagari sentence.`
      : '';

    const prompt = `You are a knowledge extraction specialist for AI voice agents.
The user pasted their raw reference material below (any mix of FAQ docs, pricing sheets, policy and terms, objection notes, troubleshooting guides, company fact sheets and past call transcripts). Your job is to file each fact into the part of the voice-agent prompt where it belongs.

BUSINESS CONTEXT:
- Company: ${context.companyName || 'Unknown'}
- Industry: ${context.industry || 'Unknown'}
- Call purpose: ${context.primaryGoal || 'Unknown'}${langDirective}

RAW KNOWLEDGE BASE:
"""
${body}
"""

EXTRACTION RULES:
1. GO IN-DEPTH AND EXTRACT EVERY GRANULAR DETAIL that might be beneficial for the prompt. Capture all nuanced business rules, implicit constraints, corner cases, and full step-by-step workflows. Do NOT over-summarize or drop long-tail knowledge.
2. NEVER invent, infer or round a fact that is not in the source. If something is absent, leave the field empty or the array short — an empty result is a correct result.
3. Preserve exact figures, prices, phone numbers, addresses, URLs and named hours VERBATIM. Do not paraphrase numbers or summarise an address.
4. Route each fact to exactly one destination and do not repeat it in another:
   - operatingHours: opening hours / availability, as one readable line.
   - servicesOffered: products, plans, SKUs or services. One short line each, including price when the source states it.
   - policies.cancellation / policies.refunds: those two policies verbatim if present.
   - policies.otherPolicies: every other rule, term or compliance requirement, prefixed with its name (e.g. "Warranty: ...").
   - capturedTopics: operational detail that is neither a policy nor a question — locations, certifications, escalation runbooks, and step-by-step troubleshooting procedures. Each becomes { topic, summary }.
   - faqs: questions a caller actually asks, with the answer as the agent should speak it (1-2 short spoken sentences).
   - objections: pushback or general concerns ("too expensive", "not interested"), with the approved response (1-2 short spoken sentences).
   - troubleshootingSteps: multi-step repair flows or procedural guides. Each becomes { problem, steps: ["step 1", "step 2"] }.
   - competitorComparisons: how the company is different from or better than a specific competitor. Each becomes { competitor, differentiation }.
   - guardrails: Explicit constraints, hard prohibitions, or "never do X" rules that the agent must strictly follow.
5. Past call transcripts are a source of REAL caller questions — mine them for faqs and objections that the FAQ document missed.
6. Spoken answers only in 'answer' and 'response': no bullet points, markdown, list syntax or reference numbers a person would not say aloud.
7. Deduplicate aggressively. At most 80 faqs, 30 objections, 20 troubleshootingSteps, 20 competitorComparisons, 40 services, 30 otherPolicies, 30 capturedTopics, 20 guardrails.

Return ONLY valid JSON:
{
  "operatingHours": "string",
  "servicesOffered": ["string"],
  "policies": { "cancellation": "string", "refunds": "string", "otherPolicies": ["string"] },
  "capturedTopics": [{ "topic": "string", "summary": "string" }],
  "faqs": [{ "question": "string", "answer": "string" }],
  "objections": [{ "trigger": "string", "response": "string" }],
  "troubleshootingSteps": [{ "problem": "string", "steps": ["string"] }],
  "competitorComparisons": [{ "competitor": "string", "differentiation": "string" }],
  "guardrails": ["string"]
}`;

    try {
      const response = await llmClient.generate({
        systemInstruction: 'You extract structured facts from business documents for voice AI agents. Return ONLY valid JSON. Never invent facts that are absent from the source.',
        prompt,
        responseMimeType: 'application/json',
        contextLabel: 'KnowledgeExtractor',
      });

      const parsed = safeParseJson<Partial<ExtractedKnowledge>>(response.text, {});

      return {
        operatingHours: typeof parsed.operatingHours === 'string' ? parsed.operatingHours.trim() : '',
        servicesOffered: asStringArray(parsed.servicesOffered, 40),
        policies: {
          cancellation: typeof parsed.policies?.cancellation === 'string' ? parsed.policies.cancellation.trim() : '',
          refunds: typeof parsed.policies?.refunds === 'string' ? parsed.policies.refunds.trim() : '',
          otherPolicies: asStringArray(parsed.policies?.otherPolicies, 30),
        },
        capturedTopics: (Array.isArray(parsed.capturedTopics) ? parsed.capturedTopics : [])
          .map((c) => ({ topic: String(c?.topic || '').trim(), summary: String(c?.summary || '').trim() }))
          .filter((c) => c.topic && c.summary)
          .slice(0, 30),
        faqs: (Array.isArray(parsed.faqs) ? parsed.faqs : [])
          .map((f) => ({ question: String(f?.question || '').trim(), answer: String(f?.answer || '').trim() }))
          .filter((f) => f.question && f.answer)
          .slice(0, 80),
        objections: (Array.isArray(parsed.objections) ? parsed.objections : [])
          .map((o) => ({ trigger: String(o?.trigger || '').trim(), response: String(o?.response || '').trim() }))
          .filter((o) => o.trigger && o.response)
          .slice(0, 30),
        troubleshootingSteps: (Array.isArray(parsed.troubleshootingSteps) ? parsed.troubleshootingSteps : [])
          .map((t) => ({ problem: String(t?.problem || '').trim(), steps: asStringArray(t?.steps, 20) }))
          .filter((t) => t.problem && t.steps.length > 0)
          .slice(0, 20),
        competitorComparisons: (Array.isArray(parsed.competitorComparisons) ? parsed.competitorComparisons : [])
          .map((c) => ({ competitor: String(c?.competitor || '').trim(), differentiation: String(c?.differentiation || '').trim() }))
          .filter((c) => c.competitor && c.differentiation)
          .slice(0, 20),
        guardrails: asStringArray(parsed.guardrails, 20),
      };
    } catch (err) {
      // Non-fatal: the prompt still compiles, it just has no knowledge-base facts.
      logger.warn('KnowledgeExtractor failed; compiling without extracted knowledge', err);
      return EMPTY_KNOWLEDGE;
    }
  }
}
