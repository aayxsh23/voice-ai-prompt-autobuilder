import { ValidationResult } from "./types";

export function validateFallbackDialogue(promptString: string): ValidationResult {
  const errors: string[] = [];
  const lines = promptString.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('Fallback:')) {
      const content = line.substring('Fallback:'.length).trim();
      if (!content.startsWith('Say:')) {
        errors.push(`Fallback at line ${i + 1} must start with spoken dialogue prefix "Say:". Found: "${content}"`);
      }
    }
  }
  return { isValid: errors.length === 0, errors };
}
