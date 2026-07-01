import { ValidationResult } from "./types";

export function validateVariableConsistency(
  promptString: string,
  variables: Array<{ key: string; type?: string; source?: string }> = []
): ValidationResult {
  const errors: string[] = [];
  const callerVars = variables.filter(v =>
    v.type !== 'system' && v.type !== 'runtime' && v.source !== 'runtime'
  );

  function extractSection(prompt: string, heading: string): string {
    const idx = prompt.indexOf(`### ${heading}`);
    if (idx === -1) return "";
    const nextIdx = prompt.indexOf("\n### ", idx + 4);
    return nextIdx !== -1 ? prompt.substring(idx, nextIdx) : prompt.substring(idx);
  }

  const callFlowSection = extractSection(promptString, 'CALL FLOW');

  for (const v of callerVars) {
    if (!v.key) continue;
    const pattern = `{{${v.key}}}`;
    if (callFlowSection && !callFlowSection.includes(pattern)) {
      errors.push(`Variable ${pattern} declared but never used in call flow`);
    }
  }

  return { isValid: errors.length === 0, errors };
}
