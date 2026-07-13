import type { BusinessSpecification } from "@/lib/llm/types";

export type LanguageMode = "english" | "hindi" | "hinglish" | "multilingual";
export type Script = "latin" | "devanagari";
export type Formality = "aap" | "tum";
export type AgentGender = "female" | "male";
export type AiDisclosure = "disclose" | "deny";

/**
 * The single, explicit language contract for a compiled prompt. Resolved once,
 * up front, and threaded through the planners + assembler — replacing the ad-hoc,
 * per-call-site language detection and the fragile post-hoc regex transliteration
 * that used to "fix up" Hindi output after the fact.
 */
export interface LanguagePolicy {
  mode: LanguageMode;
  /** Which script the spoken Hindi content is written in. English terms always stay Latin. */
  script: Script;
  formality: Formality;
  agentGender: AgentGender;
  /** Target TTS/voice engine — drives script choice for Hinglish. */
  targetTTS: string;
  aiDisclosure: AiDisclosure;
  /** True when the agent's PRIMARY output language is Hindi/Hinglish (Devanagari-primary). */
  isHindiOrHinglish: boolean;
  /** True when the agent may speak Hindi at all (Hindi, Hinglish, OR multilingual). */
  mayUseHindi: boolean;
}

const DEVANAGARI = /[ऀ-ॿ]/;

export function containsDevanagari(text: string | undefined | null): boolean {
  return !!text && DEVANAGARI.test(text);
}

/**
 * TTS engines that render Devanagari natively/well. For a Hinglish flow on any
 * other engine, romanized (Latin) Hinglish is usually the safer, more intelligible
 * choice — so Hinglish defaults to Devanagari only on a Devanagari-friendly engine.
 * Hindi-only always uses Devanagari regardless of engine.
 */
const DEVANAGARI_FRIENDLY_TTS = new Set(["sarvam", "google", "azure", "reverie", "elevenlabs"]);

export function resolveLanguagePolicy(
  spec?: Partial<BusinessSpecification>,
  draft?: { languageMode?: string } | null,
): LanguagePolicy {
  const meta = spec?.meta;
  const mode = ((meta?.languageMode || draft?.languageMode || "english") as LanguageMode);

  // The agent's PRIMARY output language is decided ONLY by the declared mode — NOT
  // by the user merely *describing* Hindi support in discovery (that used to trip a
  // /hindi|hinglish/ regex and wrongly flip an English-default / multilingual agent
  // to Devanagari-everything). Multilingual & English both default to English output;
  // a multilingual agent switches to Hindi live via LANGUAGE HANDLING, not by
  // pre-writing every scripted line in Devanagari.
  const isHindiOrHinglish = mode === "hindi" || mode === "hinglish";
  const mayUseHindi = isHindiOrHinglish || mode === "multilingual";

  const targetTTS = (meta?.targetTTS || "generic").toLowerCase();

  let script: Script;
  if (mode === "hindi") {
    script = "devanagari";
  } else if (mode === "hinglish") {
    script = DEVANAGARI_FRIENDLY_TTS.has(targetTTS) ? "devanagari" : "latin";
  } else {
    // english + multilingual → English-primary (Latin)
    script = "latin";
  }

  return {
    mode,
    script,
    formality: meta?.formality || "aap",
    agentGender: meta?.agentGender || "female",
    targetTTS,
    aiDisclosure: meta?.aiDisclosure || "disclose",
    isHindiOrHinglish,
    mayUseHindi,
  };
}

/** Hindi verb-ending helpers so agent lines agree with the configured agent gender. */
export function hindiVerbForms(gender: AgentGender) {
  const female = gender !== "male";
  return {
    rahi: female ? "रही" : "रहा", // "…कर रही/रहा हूँ"
    sakti: female ? "सकती" : "सकता", // "…कर सकती/सकता हूँ"
    gayi: female ? "गई" : "गया", // "…समझ गई/गया"
  };
}
