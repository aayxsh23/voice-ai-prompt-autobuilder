/**
 * Deterministic extraction of persona preferences from the discovery conversation.
 * These matter for correctness (an agent instructed NOT to reveal it's an AI must
 * not announce it) and the LLM JSON-patch extraction is unreliable for them, so we
 * detect them from the raw user text directly.
 */

export function detectAiDisclosure(text: string): 'disclose' | 'deny' | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase();

  // "do NOT disclose / reveal / imply … that it is an AI / bot / automated …"
  const deny =
    /\b(not|never|don'?t|do not|no|without|avoid|shouldn'?t|should not)\b[\s\S]{0,70}\b(disclos|reveal|admit|mention|imply|announce|say|state|tell)\b[\s\S]{0,50}\b(ai|a\.i\.|bot|automated|automation|virtual assistant|robot|machine|artificial)\b/;
  // "present / pose / act as a human", "as if … a human representative"
  const human =
    /\b(human representative|as a human|like a human|as if[\s\S]{0,25}human|pose as|present (itself|yourself|themselves) as (a )?human|act (like|as) (a )?human)\b/;
  if (deny.test(t) || human.test(t)) return 'deny';

  const disclose =
    /\b(disclose|reveal|announce|clearly state)\b[\s\S]{0,50}\b(ai|automated|assistant|bot)\b/;
  if (disclose.test(t)) return 'disclose';

  return undefined;
}

export function detectAgentGender(text: string): 'female' | 'male' | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase();
  if (/\b(male agent|male voice|man'?s voice|he\/him|masculine|male representative|male persona)\b/.test(t)) return 'male';
  if (/\b(female agent|female voice|woman'?s voice|she\/her|feminine|female representative|female persona)\b/.test(t)) return 'female';
  return undefined;
}
