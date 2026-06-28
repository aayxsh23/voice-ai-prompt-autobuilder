// lib/compiler/compilers/VoiceCompiler.ts

import { geminiClient } from "@/lib/llm/geminiProvider";
import { VoiceAgentIR } from "../ir/IntermediateRepresentation";

export class VoiceCompiler {
  async compile(ir: VoiceAgentIR): Promise<string> {
    const languageVariant = ir.meta?.languageVariant || "English";
    const toneProfile = ir.meta?.toneProfile || ["Professional"];

    const response = await geminiClient.generate({
      systemInstruction: `You are a Speech Synthesis Specialist. Generate the TTS rules block.
RULE 1: Ban all markdown (*, _, []) from spoken dialogue.
RULE 2: Enforce strict digit speakability (e.g., phone numbers read digit-by-digit).
RULE 3: Emails must be converted to spoken text (replace '@' with 'at', '.' with 'dot').
Enforce strict script guardrails based on target language: if Hindi/Devanagari is target, force pure Devanagari script output and strictly ban Hinglish Romanized transliteration. Technical acronyms (e.g. GST, SMS, OTP) must be written in Roman block letters separated by dashes.`,
      prompt: `Generate the AUDIO, TTS, and SPEAKABILITY module for an agent with tone profile: ${toneProfile.join(", ")} and target language variant: ${languageVariant}.`
    });
    return response.text;
  }
}
