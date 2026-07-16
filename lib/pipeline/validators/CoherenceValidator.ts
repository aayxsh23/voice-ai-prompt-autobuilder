import { ValidationResult } from "./types";
import { PromptPackageDraft } from "@/lib/llm/types";

export function validateCoherence(
  promptString: string,
  draft?: Partial<PromptPackageDraft>,
  ir?: any
): ValidationResult {
  const errors: string[] = [];

  // `ir` is a BusinessSpecification, whose goal lives at meta.primaryGoal — without
  // that fallback, callers passing only a spec resolved to "" and skipped the check.
  const goal = draft?.primaryGoal || ir?.meta?.primaryGoal || ir?.mission?.goal || ir?.meta?.role || "";
  if (goal && goal !== "Automated Voice Assistant") {
    // Check key words of goal appear somewhere in prompt
    const words = goal.split(/\s+/).filter((w: string) => w.length > 5);
    if (words.length > 0) {
      const promptLower = promptString.toLowerCase();
      const hasWord = words.some((w: string) => promptLower.includes(w.toLowerCase()));
      if (!hasWord) {
        errors.push(`Primary goal keywords not reflected in generated call flow or dialogue.`);
      }
    }
  }

  return { isValid: errors.length === 0, errors };
}
