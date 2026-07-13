/**
 * Curated "gold" dialogue exemplars distilled from production reference prompts
 * (Aakash / FITTR). They teach register, code-mix ratio, and readback style far
 * better than rule lists. Injected as STYLE EXEMPLARS (to paraphrase, never copy)
 * into structured generation, matched by (function × language).
 *
 * Hindi/Hinglish lines are written in Devanagari with English domain terms inline,
 * exactly as the target TTS should speak them.
 */
export type FewShotFunction =
  | 'opening'
  | 'goal'
  | 'screening'
  | 'scheduling'
  | 'readback'
  | 'retry'
  | 'audio_drop'
  | 'refusal'
  | 'dont_know'
  | 'abuse_boundary'
  | 'resume'
  | 'reaction';

export type FewShotLanguage = 'english' | 'hinglish';

export interface FewShotExample {
  fn: FewShotFunction;
  language: FewShotLanguage;
  text: string;
}

export const GOLD_EXAMPLES: FewShotExample[] = [
  // ── Hinglish (Devanagari + inline English domain terms) ──────────────────
  { fn: 'opening', language: 'hinglish', text: 'नमस्ते {{first_name}} जी! मैं रिया — FITTR से। दो मिनट मिलेंगे, coach को तैयार करने के लिए?' },
  { fn: 'goal', language: 'hinglish', text: 'अभी आपका सबसे बड़ा फिटनेस गोल क्या है?' },
  { fn: 'screening', language: 'hinglish', text: 'एक बात पूछ लूँ — कोई injury या health condition है जो coach को पता होनी चाहिए?' },
  { fn: 'scheduling', language: 'hinglish', text: 'call के लिए कौन सा समय ठीक रहता है, और अभी आप किस शहर में हैं?' },
  { fn: 'readback', language: 'hinglish', text: '[reaction] — [callback_window], [city] टाइम।' },
  { fn: 'retry', language: 'hinglish', text: 'कोई बात नहीं — किसी और समय बात करने के बारे में पूछ लीजिए।' },
  { fn: 'audio_drop', language: 'hinglish', text: 'लगता है लाइन थोड़ी कट गयी थी, अब सुनाई दे रहा है?' },
  { fn: 'refusal', language: 'hinglish', text: 'शायद कुछ समझने में गलती हो रही है — ये हमारी बातचीत से कैसे जुड़ा है?' },
  { fn: 'dont_know', language: 'hinglish', text: 'मेरे पास ये जानकारी नहीं है।' },
  { fn: 'abuse_boundary', language: 'hinglish', text: 'मैं मदद करना चाहती हूँ, लेकिन बातचीत ऐसे ही चलती रही तो मैं आगे बात नहीं कर पाऊँगी।' },
  { fn: 'resume', language: 'hinglish', text: 'तो जैसा मैं बता रही थी…' },
  { fn: 'reaction', language: 'hinglish', text: 'अच्छा लगा सुनकर। / ठीक है — बताने के लिए शुक्रिया। / अरे वाह।' },

  // ── English ──────────────────────────────────────────────────────────────
  { fn: 'opening', language: 'english', text: "Hi {{first_name}}, it's Riya from FITTR. Do you have two minutes so I can brief your coach?" },
  { fn: 'goal', language: 'english', text: "What's the main goal you're hoping to reach with your coach?" },
  { fn: 'screening', language: 'english', text: 'Before I pass this along — any injury, surgery, or condition your coach should know about?' },
  { fn: 'scheduling', language: 'english', text: "What's a good time for a call — and what city or country are you in?" },
  { fn: 'readback', language: 'english', text: 'Got it — [callback_window], [city] time.' },
  { fn: 'retry', language: 'english', text: 'No problem — is there a better time for a quick call?' },
  { fn: 'audio_drop', language: 'english', text: 'I think the line may have cut out, can you hear me now?' },
  { fn: 'refusal', language: 'english', text: "I might be missing something — how does this relate to what we're discussing?" },
  { fn: 'dont_know', language: 'english', text: "I don't have that information." },
  { fn: 'abuse_boundary', language: 'english', text: "I want to help, but I'm not able to continue if the conversation stays disrespectful." },
  { fn: 'resume', language: 'english', text: 'Great, so as I was saying...' },
  { fn: 'reaction', language: 'english', text: 'Good one. / Okay, thanks for telling me. / Ha, fair enough.' },
];
