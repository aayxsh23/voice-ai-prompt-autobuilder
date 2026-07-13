export interface SlotDigitSpec {
  pattern: RegExp;
  expectedDigits: number;
  mode: 'digits' | 'email';
}

export const SLOT_DIGIT_REGISTRY: SlotDigitSpec[] = [
  { pattern: /email|mail/i, expectedDigits: 0, mode: 'email' },
  { pattern: /phone|mobile|whatsapp|contact_number|telephone/i, expectedDigits: 10, mode: 'digits' },
  { pattern: /pin|pincode|pin_code|passcode|otp|verification_code|security_code/i, expectedDigits: 6, mode: 'digits' },
  { pattern: /postal|zip|postal_code|zipcode/i, expectedDigits: 6, mode: 'digits' },
  { pattern: /dob|date_of_birth/i, expectedDigits: 8, mode: 'digits' },
  { pattern: /account|account_number/i, expectedDigits: 12, mode: 'digits' },
  { pattern: /number|digits|id_number/i, expectedDigits: 10, mode: 'digits' },
];

/**
 * Resolves the capture spec (mode and expected digits) for any slot name based on standard patterns.
 */
export function resolveSlotDigitSpec(slotName: string): { expectedDigits: number; mode: 'digits' | 'email' } | null {
  if (!slotName) return null;
  const match = SLOT_DIGIT_REGISTRY.find(r => r.pattern.test(slotName));
  if (!match) return null;
  return { expectedDigits: match.expectedDigits, mode: match.mode };
}

/**
 * A "derived" slot is a post-call classification/extraction the agent determines
 * BY ANALYZING the conversation (e.g. objection_type, intent_category,
 * eligibility_status, detected_language, opt_out_confirmed) — it must NEVER become
 * a "please tell me your <slot>" question to the caller. Contrast with collected
 * slots the caller genuinely states (name, phone, appointment_date/time, address).
 */
export function isDerivedSlot(slotName: string): boolean {
  if (!slotName) return false;
  return (
    /(^|_)(intent|classification|category|disposition|status|eligibility|sentiment|outcome|type|flag)($|_)/i.test(slotName) ||
    /(objection_type|opt_out|detected_language|flag_status|is_[a-z])/i.test(slotName)
  );
}
