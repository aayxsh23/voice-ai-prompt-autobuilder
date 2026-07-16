export interface SlotDigitSpec {
  pattern: RegExp;
  expectedDigits: number;
  mode: 'digits' | 'email';
  /** True when the digit count varies by country (phone numbers), so the default
   *  must not be asserted unless the deployment region is known. */
  regionDependent?: boolean;
}

export const SLOT_DIGIT_REGISTRY: SlotDigitSpec[] = [
  { pattern: /email|mail/i, expectedDigits: 0, mode: 'email' },
  { pattern: /phone|mobile|whatsapp|contact_number|telephone/i, expectedDigits: 10, mode: 'digits', regionDependent: true },
  { pattern: /pin|pincode|pin_code|passcode|otp|verification_code|security_code/i, expectedDigits: 6, mode: 'digits', regionDependent: true },
  { pattern: /postal|zip|postal_code|zipcode/i, expectedDigits: 6, mode: 'digits', regionDependent: true },
  { pattern: /dob|date_of_birth/i, expectedDigits: 8, mode: 'digits' },
  { pattern: /account|account_number/i, expectedDigits: 12, mode: 'digits', regionDependent: true },
  { pattern: /number|digits|id_number/i, expectedDigits: 10, mode: 'digits', regionDependent: true },
];

/** National significant number lengths. Absent region -> do not assert a length. */
const PHONE_DIGITS_BY_REGION: Record<string, number> = {
  IN: 10, US: 10, CA: 10, GB: 10, QA: 8, AE: 9, SA: 9, SG: 8, AU: 9,
};

/**
 * Resolves the capture spec for a slot. `expectedDigits` is omitted when the count
 * is region-dependent and the region is unknown — asserting "10 digits" at a Qatar
 * caller (8) makes validation reject every valid number.
 */
export function resolveSlotDigitSpec(
  slotName: string,
  region?: string,
): { expectedDigits?: number; mode: 'digits' | 'email' } | null {
  if (!slotName) return null;
  const match = SLOT_DIGIT_REGISTRY.find(r => r.pattern.test(slotName));
  if (!match) return null;
  if (match.mode === 'email') return { mode: 'email' };

  if (!match.regionDependent) return { expectedDigits: match.expectedDigits, mode: match.mode };

  const isPhone = /phone|mobile|whatsapp|contact_number|telephone/i.test(slotName);
  if (isPhone) {
    const digits = region ? PHONE_DIGITS_BY_REGION[region.toUpperCase()] : undefined;
    return digits ? { expectedDigits: digits, mode: 'digits' } : { mode: 'digits' };
  }
  // Non-phone region-dependent slots keep their conventional default only when a
  // region is established; otherwise the caller-side tool validates without a count.
  return region ? { expectedDigits: match.expectedDigits, mode: 'digits' } : { mode: 'digits' };
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
