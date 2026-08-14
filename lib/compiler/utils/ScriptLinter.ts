import { llmClient } from "@/lib/llm/llmProvider";
import { logger } from "@/lib/logger";

interface LinterLanguageConfig {
  languageName: string;
  nativeScript: string;
  loanLanguage: string;
  loanScript: string;
  digitMap: Record<string, string>;
}

const LANGUAGE_REGISTRY: Record<string, LinterLanguageConfig> = {
  "hindi": {
    languageName: "Hindi",
    nativeScript: "Devanagari",
    loanLanguage: "English",
    loanScript: "Roman",
    digitMap: { '0': 'शून्य', '1': 'एक', '2': 'दो', '3': 'तीन', '4': 'चार', '5': 'पांच', '6': 'छह', '7': 'सात', '8': 'आठ', '9': 'नौ' }
  },
  "hinglish": {
    languageName: "Hinglish",
    nativeScript: "Devanagari",
    loanLanguage: "English",
    loanScript: "Roman",
    digitMap: { '0': 'शून्य', '1': 'एक', '2': 'दो', '3': 'तीन', '4': 'चार', '5': 'पांच', '6': 'छह', '7': 'सात', '8': 'आठ', '9': 'नौ' }
  },
  "marathi": {
    languageName: "Marathi",
    nativeScript: "Devanagari",
    loanLanguage: "English",
    loanScript: "Roman",
    digitMap: { '0': 'शून्य', '1': 'एक', '2': 'दोन', '3': 'तीन', '4': 'चार', '5': 'पाच', '6': 'सहा', '7': 'सात', '8': 'आठ', '9': 'नऊ' }
  },
  "kannada": {
    languageName: "Kannada",
    nativeScript: "Kannada",
    loanLanguage: "English",
    loanScript: "Roman",
    digitMap: { '0': 'ಸೊನ್ನೆ', '1': 'ಒಂದು', '2': 'ಎರಡು', '3': 'ಮೂರು', '4': 'ನಾಲ್ಕು', '5': 'ಐದು', '6': 'ಆರು', '7': 'ಏಳು', '8': 'ಎಂಟು', '9': 'ಒಂಬತ್ತು' }
  },
  "tamil": {
    languageName: "Tamil",
    nativeScript: "Tamil",
    loanLanguage: "English",
    loanScript: "Roman",
    digitMap: { '0': 'சுழியம்', '1': 'ஒன்று', '2': 'இரண்டு', '3': 'மூன்று', '4': 'நான்கு', '5': 'ஐந்து', '6': 'ஆறு', '7': 'ஏழு', '8': 'எட்டு', '9': 'ஒன்பது' }
  },
  "telugu": {
    languageName: "Telugu",
    nativeScript: "Telugu",
    loanLanguage: "English",
    loanScript: "Roman",
    digitMap: { '0': 'సున్నా', '1': 'ఒకటి', '2': 'రెండు', '3': 'మూడు', '4': 'నాలుగు', '5': 'ఐదు', '6': 'ఆరు', '7': 'ఏడు', '8': 'ఎనిమిది', '9': 'తొమ్మిది' }
  },
  "gujarati": {
    languageName: "Gujarati",
    nativeScript: "Gujarati",
    loanLanguage: "English",
    loanScript: "Roman",
    digitMap: { '0': 'શૂન્ય', '1': 'એક', '2': 'બે', '3': 'ત્રણ', '4': 'ચાર', '5': 'પાંચ', '6': 'છ', '7': 'સાત', '8': 'આઠ', '9': 'નવ' }
  },
  "bengali": {
    languageName: "Bengali",
    nativeScript: "Bengali",
    loanLanguage: "English",
    loanScript: "Roman",
    digitMap: { '0': 'শূন্য', '1': 'এক', '2': 'দুই', '3': 'তিন', '4': 'চার', '5': 'পাঁচ', '6': 'ছয়', '7': 'সাত', '8': 'আট', '9': 'নয়' }
  },
  "punjabi": {
    languageName: "Punjabi",
    nativeScript: "Gurmukhi",
    loanLanguage: "English",
    loanScript: "Roman",
    digitMap: { '0': 'ਸਿਫ਼ਰ', '1': 'ਇੱਕ', '2': 'ਦੋ', '3': 'ਤਿੰਨ', '4': 'ਚਾਰ', '5': 'ਪੰਜ', '6': 'ਛੇ', '7': 'ਸੱਤ', '8': 'ਅੱਠ', '9': 'ਨੌਂ' }
  },
  "malayalam": {
    languageName: "Malayalam",
    nativeScript: "Malayalam",
    loanLanguage: "English",
    loanScript: "Roman",
    digitMap: { '0': 'പൂജ്യം', '1': 'ഒന്ന്', '2': 'രണ്ട്', '3': 'മൂന്ന്', '4': 'നാല്', '5': 'അഞ്ച്', '6': 'ആറ്', '7': 'ഏഴ്', '8': 'എട്ട്', '9': 'ഒമ്പത്' }
  },
  "urdu": {
    languageName: "Urdu",
    nativeScript: "Nastaliq",
    loanLanguage: "English",
    loanScript: "Roman",
    digitMap: { '0': 'صفر', '1': 'ایک', '2': 'دو', '3': 'تین', '4': 'چار', '5': 'پانچ', '6': 'چھ', '7': 'سات', '8': 'آٹھ', '9': 'نو' }
  }
};

export class ScriptLinter {
  public static async lintScript(text: string, langCode: string, sessionId?: string): Promise<string> {
    if (!text || !text.trim()) return text;

    const config = LANGUAGE_REGISTRY[langCode.toLowerCase()];
    if (!config) {
      logger.warn(`No linter config for ${langCode}, skipping lint.`);
      return text;
    }

    let processedText = text;

    try {
      const promptText = this.buildPrompt(config, text);
      
      const response = await llmClient.generate({
        systemInstruction: "You are a strict JSON-only data extractor for TTS normalization.",
        prompt: promptText,
        contextLabel: "ScriptLinter",
        sessionId
      });

      const jsonMatch = response.text?.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (jsonMatch) {
        const substitutions: { original: string, replacement: string }[] = JSON.parse(jsonMatch[0]);
        
        for (const sub of substitutions) {
          processedText = processedText.split(sub.original).join(sub.replacement);
        }
      }
    } catch (err) {
      logger.error("ScriptLinter LLM extraction failed, relying purely on regex failsafe", err);
    }

    processedText = processedText.replace(/\d/g, (match) => {
      return " " + (config.digitMap[match] || match) + " ";
    }).replace(/\s+/g, ' ').trim();

    return processedText;
  }

  public static async lintScriptsBatch(texts: string[], langCode: string, sessionId?: string): Promise<string[]> {
    if (!texts || texts.length === 0) return texts;

    const config = LANGUAGE_REGISTRY[langCode.toLowerCase()];
    if (!config) {
      logger.warn(`No linter config for ${langCode}, skipping batch lint.`);
      return texts;
    }

    const filteredTexts = texts.filter(t => t && t.trim().length > 0);
    if (filteredTexts.length === 0) return texts;

    const combinedText = filteredTexts.join('\n---\n');
    let substitutions: { original: string, replacement: string }[] = [];

    try {
      const promptText = this.buildPrompt(config, combinedText);
      const response = await llmClient.generate({
        systemInstruction: "You are a strict JSON-only data extractor for TTS normalization.",
        prompt: promptText,
        contextLabel: "ScriptLinterBatch",
        sessionId
      });

      const jsonMatch = response.text?.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (jsonMatch) {
        substitutions = JSON.parse(jsonMatch[0]);
      }
    } catch (err) {
      logger.error("ScriptLinter LLM batch extraction failed, relying purely on regex failsafe", err);
    }

    return texts.map(text => {
      if (!text || !text.trim()) return text;
      let processedText = text;
      
      for (const sub of substitutions) {
        if (sub.original && sub.replacement) {
          processedText = processedText.split(sub.original).join(sub.replacement);
        }
      }
      
      processedText = processedText.replace(/\d/g, (match) => {
        return " " + (config.digitMap[match] || match) + " ";
      }).replace(/\s+/g, ' ').trim();

      return processedText;
    });
  }

  private static buildPrompt(config: LinterLanguageConfig, text: string): string {
    return `Analyze the following ${config.languageName} script written for a Text-To-Speech engine.

TASK 1: Extract any ${config.loanLanguage} loanwords, tech terms, or proper nouns that are currently written in ${config.nativeScript} script. Provide their correct ${config.loanScript} script equivalent.
TASK 2: Extract any raw numeric digits (0-9) and provide their spelled-out ${config.languageName} word equivalent.

RETURN ONLY A JSON ARRAY OF SUBSTITUTIONS. Do NOT return the rewritten text. Do NOT wrap the JSON in markdown code blocks.
Example format:
[
  { "original": "सॉफ्टवेयर", "replacement": "software" },
  { "original": "9827", "replacement": "नौ आठ दो सात" }
]

TEXT TO ANALYZE:
"${text}"`;
  }
}
