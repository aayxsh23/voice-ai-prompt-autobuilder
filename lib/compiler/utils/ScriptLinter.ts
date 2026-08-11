import { llmClient } from "@/lib/llm/llmProvider";
import { logger } from "@/lib/logger";

const DIGIT_TO_HINDI: Record<string, string> = {
  '0': 'शून्य',
  '1': 'एक',
  '2': 'दो',
  '3': 'तीन',
  '4': 'चार',
  '5': 'पांच',
  '6': 'छह',
  '7': 'सात',
  '8': 'आठ',
  '9': 'नौ'
};

const LINTER_INSTRUCTION = `You are a strict text linter for Hindi and Hinglish voice agent scripts.
Your only job is to perform two precise formatting tasks on the provided text. Do NOT change the meaning, tone, or overall structure of the text. Do NOT translate the text into English if it is in Hindi.

TASK 1: ENGLISH LOANWORDS & PROPER NOUNS -> ROMAN SCRIPT
Any word of English origin, AND all proper nouns (such as city names, company names, software names, etc.), that are written in Devanagari script MUST be converted back to Roman/English script. This applies EVEN to extremely common Indian business terms. Never leave an English-origin word or a proper noun in Devanagari.
Examples of words to convert:
- "सॉफ्टवेयर" -> "software"
- "ट्रेनिंग" -> "training"
- "शेड्यूल" -> "schedule"
- "बिलिंग" -> "billing"
- "इनवॉइस" -> "invoice"
- "रिकॉर्ड" -> "record"
- "क्वालिटी" -> "quality"
- "कॉल" -> "call"
- "नंबर" -> "number"
- "डेमो" -> "demo"
- "ओनर" -> "owner"
- "ऑफिस" -> "office"
- "हेड ऑफिस" -> "head office"
- "कंपनी" -> "company"
- "कस्टमर" -> "customer"
- "दिल्ली" -> "Delhi"
- "मुंबई" -> "Mumbai"

TASK 2: NUMERIC DIGITS -> SPELLED OUT WORDS
All numeric digits (0-9) MUST be spelled out fully as Hindi words (if in a Hindi context).
Examples:
- "10" -> "दस"
- "2" -> "दो"
- "45" -> "पैंतालीस"
- "9827" -> "नौ आठ दो सात" (for phone numbers/codes, spell digit by digit)

Return ONLY the cleaned, linted text. Do not add any commentary, quotes, or markdown formatting.`;

export class ScriptLinter {
  /**
   * Applies a deterministic, LLM-powered lint pass over generated Hindi/Hinglish text
   * to fix transliterated English loanwords and numeric digits.
   */
  public static async lintHindiScript(text: string, sessionId?: string): Promise<string> {
    if (!text || !text.trim()) {
      return text;
    }

    try {
      // Pass 1: LLM Rewrite
      const response = await llmClient.generate({
        systemInstruction: LINTER_INSTRUCTION,
        prompt: text,
        contextLabel: "ScriptLinter",
        sessionId
      });
      
      let lintedText = response.text || text;

      // Pass 2: Deterministic Regex Failsafe for digits
      // If the LLM missed any digits, we strictly replace them with Hindi words digit-by-digit.
      lintedText = lintedText.replace(/\d/g, (match) => {
        return " " + (DIGIT_TO_HINDI[match] || match) + " ";
      }).replace(/\s+/g, ' ').trim();

      return lintedText;
    } catch (err) {
      logger.error("ScriptLinter failed to lint script, returning original", err);
      // Failsafe: at least run the regex
      return text.replace(/\d/g, (match) => " " + (DIGIT_TO_HINDI[match] || match) + " ").replace(/\s+/g, ' ').trim();
    }
  }
}
