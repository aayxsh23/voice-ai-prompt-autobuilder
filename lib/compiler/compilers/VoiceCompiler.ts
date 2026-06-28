// lib/compiler/compilers/VoiceCompiler.ts

import { geminiClient } from "@/lib/llm/geminiProvider";
import { VoiceAgentIR } from "../ir/IntermediateRepresentation";

export class VoiceCompiler {
  async compile(ir: VoiceAgentIR): Promise<string> {
    const languageVariant = ir.meta?.languageVariant || "English";
    const toneProfile = ir.meta?.toneProfile || ["Professional"];

    return await geminiClient.generate({
      systemInstruction: `You are a specialist in Speech Synthesis, Acoustic Normalization, and Audio System Latency. 
Generate text-to-speech speakability direct rules for a telephone system.
Hardcode absolute instructions for raw formatting bans (no markdown symbols, no raw emails like @ or dots).
Add specific shock-absorbers for audio drops: if user says 'hello' out of context, force verification loop.
Enforce strict script guardrails based on target language:
- If Hindi/Devanagari is target, force pure Devanagari script output and strictly ban Hinglish Romanized transliteration.
- For all technical terms and acronyms (e.g. GST, SMS, ID, OTP), require Roman block letters separated by dashes or spaces so TTS acoustic engines speak letter-by-letter correctly.
- Force single digits in phone numbers or IDs to be spelled out individually as words with micro-pauses.`,
      prompt: `Generate the AUDIO, TTS, and SPEAKABILITY module for an agent with tone profile: ${toneProfile.join(", ")} and target language variant: ${languageVariant}.`
    }).then(res => res.text);
  }
}
