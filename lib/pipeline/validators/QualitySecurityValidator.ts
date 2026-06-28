export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validatePrompt(promptString: string): ValidationResult {
  const errors: string[] = [];
  
  // a. Unfilled placeholders (e.g. [INSERT CLINIC NAME], [TODO], <YOUR COMPANY>)
  const placeholderMatches = promptString.match(/\[(INSERT|TODO|YOUR|ENTER|ADD)[^\]]*\]/gi) || promptString.match(/<(INSERT|TODO|YOUR|ENTER|ADD)[^>]*>/gi);
  if (placeholderMatches) {
    for (const match of placeholderMatches) errors.push(`Unfilled placeholder detected: ${match}`);
  }

  // b. Token ceiling (> 7000 estimated tokens)
  const estimatedTokens = Math.ceil(promptString.length / 4);
  if (estimatedTokens > 7000) errors.push(`Token ceiling exceeded: estimated ${estimatedTokens} tokens`);

  // c. Banned clinical/legal patterns (Regex detection)
  const BANNED_CONTENT_PATTERNS = [
    /\byou (have|likely have|may have|are experiencing)\b.{0,40}(condition|disease|disorder|infection|diagnosis)/i,
    /\b(prescribe|administer|take|dosage|milligrams?|mg)\b/i,
    /\byour (insurance|plan) (covers?|will pay|includes?)\b/i,
    /\bI (recommend|suggest|advise) (you )?(see|visit|consult)\b/i,
  ];
  for (const pattern of BANNED_CONTENT_PATTERNS) {
    if (pattern.test(promptString)) {
      errors.push(`Banned pattern detected matching rule: ${pattern.toString()}`);
    }
  }

  // d. Mandatory section headings
  const requiredHeadings = [
    "### AGENT IDENTITY", "### CONTEXT & VARIABLES", "### PRIMARY GOAL", "### CALL FLOW",
    "### FAQ & KNOWLEDGE DEFLECTION", "### OBJECTION HANDLING", "### TTS & VOICE RULES",
    "### TOOL & FUNCTION EXECUTION", "### GUARDRAILS",
    "### MANDATORY EMERGENCY & SCOPE GUARDRAILS — IMMUTABLE",
    "### CLOSING RULES", "### AI IDENTITY DISCLOSURE", "### OFF-TOPIC HANDLING", "### ENDING RULE"
  ];
  for (const heading of requiredHeadings) {
    if (!promptString.includes(heading)) errors.push(`Missing mandatory section heading: ${heading}`);
  }

  // e. Question stacking in Say lines
  const sayLineMatches = promptString.match(/Say:\s*"([^"]*)"/g) || [];
  for (const sayBlock of sayLineMatches) {
    if ((sayBlock.match(/\?/g) || []).length > 1) errors.push(`Question stacking detected: ${sayBlock}`);
  }

  return { valid: errors.length === 0, errors };
}
