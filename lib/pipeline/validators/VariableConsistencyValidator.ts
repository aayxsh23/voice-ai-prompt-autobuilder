import { ValidationResult } from "./types";

export function validateVariableConsistency(
  promptString: string,
  variables: Array<{ key: string; type?: string; source?: string; fieldDirection?: string }> = []
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
    const isOutfield = v.fieldDirection === 'outfield' || v.source === 'extraction';
    const isInfield = v.fieldDirection === 'infield' || v.source === 'crm' || v.source === 'api';

    if (isOutfield) {
      const outPattern = `[${v.key}]`;
      const inPattern = `{{${v.key}}}`;
      if (callFlowSection && !callFlowSection.includes(outPattern) && !callFlowSection.includes(inPattern) && !promptString.includes(outPattern)) {
        errors.push(`Variable [${v.key}] declared as outfield but never marked for collection in call flow extractions`);
      }
    } else if (isInfield) {
      const inPattern = `{{${v.key}}}`;
      if (callFlowSection && !callFlowSection.includes(inPattern) && !promptString.includes(inPattern)) {
        errors.push(`Variable {{${v.key}}} declared as pre-call infield but never used in call flow dialogue or context`);
      }
    } else {
      const outPattern = `[${v.key}]`;
      const inPattern = `{{${v.key}}}`;
      if (callFlowSection && !callFlowSection.includes(outPattern) && !callFlowSection.includes(inPattern) && !promptString.includes(outPattern) && !promptString.includes(inPattern)) {
        errors.push(`Variable ${inPattern} declared but never used in call flow`);
      }
    }
  }

  return { isValid: errors.length === 0, errors };
}
