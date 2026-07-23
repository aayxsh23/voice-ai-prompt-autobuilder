export type ToolArgValue = string | number | boolean | { raw: string };

export function renderArgValue(v: ToolArgValue): string {
  if (v !== null && typeof v === 'object' && 'raw' in v) return v.raw;
  if (typeof v === 'string') return `"${v}"`;
  return String(v);
}

export function classifyFieldKind(name: string): 'phone' | 'pin' | 'otp' | 'email' | null {
  const n = (name || '').toLowerCase();
  if (/phone|mobile|whatsapp|contact_?number|telephone/.test(n)) return 'phone';
  if (/postal|pin[_ ]?code|zip|zipcode/.test(n)) return 'pin';
  if (/otp|passcode|verification[_ ]?code|security[_ ]?code/.test(n)) return 'otp';
  if (/email|mail/.test(n)) return 'email';
  return null;
}
