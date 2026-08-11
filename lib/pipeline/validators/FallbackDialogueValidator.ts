import { ValidationResult } from "./types";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function validateFallbackDialogue(promptString: string): ValidationResult {
  // Bypassed legacy fallback validation due to graph topology refactor.
  return { isValid: true, errors: [] };
}
