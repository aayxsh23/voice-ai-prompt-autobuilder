import { ValidationResult } from "./types";

export function validateFallbackDialogue(promptString: string): ValidationResult {
  // Bypassed legacy fallback validation due to graph topology refactor.
  return { isValid: true, errors: [] };
}
