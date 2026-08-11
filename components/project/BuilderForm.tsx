'use client';

import React, { useState, useRef } from 'react';
import {
  UserCircle,
  MessageSquare,
  BookOpen,
  ShieldCheck,
  Plus,
  X,
  Check,
  Minus,
  Info,
  ArrowRight,
  Loader2,
  Trash2,
  Target,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */

const REGION_PHONE_CODES: Record<string, string> = {
  US: '+1',
  CA: '+1',
  GB: '+44',
  IN: '+91',
  AU: '+61',
  DE: '+49',
  FR: '+33',
  ES: '+34',
  IT: '+39',
  BR: '+55',
  MX: '+52'
};

export function formatVariableKey(input: string) {
  const clean = input.replace(/[^a-zA-Z0-9]/g, ' ').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return '{{' + words[0].toLowerCase() + '}}';
  return '{{' + words[0].toLowerCase() + '_' + words.slice(1).join('').toLowerCase() + '}}';
}

/* ═══════════════════════════════════════════════════════════════
   STATIC OPTION LISTS
   ═══════════════════════════════════════════════════════════════ */

const INDUSTRIES = [
  'E-commerce', 'Healthcare', 'Finance', 'Real Estate', 'Education',
  'Insurance', 'SaaS', 'Travel & Hospitality', 'Logistics', 'Other',
];

const LANGUAGES = ['English', 'Hindi', 'Spanish', 'French', 'German'];

export const REGIONS = [
  { code: '', label: 'Not specified' },
  { code: 'US', label: 'United States' },
  { code: 'CA', label: 'Canada' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'IN', label: 'India' },
  { code: 'AE', label: 'United Arab Emirates' },
  { code: 'SA', label: 'Saudi Arabia' },
  { code: 'QA', label: 'Qatar' },
  { code: 'SG', label: 'Singapore' },
  { code: 'AU', label: 'Australia' },
  { code: 'NZ', label: 'New Zealand' },
  { code: 'DE', label: 'Germany' },
  { code: 'FR', label: 'France' },
  { code: 'ES', label: 'Spain' },
  { code: 'BR', label: 'Brazil' },
  { code: 'MX', label: 'Mexico' },
  { code: 'ZA', label: 'South Africa' },
  { code: 'PH', label: 'Philippines' },
  { code: 'MY', label: 'Malaysia' },
  { code: 'ID', label: 'Indonesia' },
];

const TONE_OPTIONS = [
  { id: 'professional', label: 'Professional', desc: 'Neutral, business-appropriate' },
  { id: 'friendly', label: 'Friendly & Warm', desc: 'Approachable, conversational' },
  { id: 'empathetic', label: 'Empathetic', desc: 'Understanding, patient' },
  { id: 'authoritative', label: 'Authoritative', desc: 'Confident, direct' },
  { id: 'casual', label: 'Casual', desc: 'Relaxed, informal' },
  { id: 'persuasive', label: 'Persuasive', desc: 'Convincing, enthusiastic' },
];

const TRANSFER_TRIGGERS = [
  'Caller explicitly asks for a human',
  'Caller sounds angry or distressed',
  "Issue is outside the agent's scope",
  'Call is after business hours',
];

export const KB_SOURCE_HINTS = [
  { title: 'FAQ document', desc: 'Common questions and answers, so the agent responds accurately without leaving the script.' },
  { title: 'Pricing and product sheet', desc: 'Plans, SKUs and features, so the agent quotes exact details instead of guessing.' },
  { title: 'Policy and terms doc', desc: 'Refunds, cancellations and compliance rules, for consistent answers.' },
  { title: 'Objection and comparison notes', desc: 'Approved responses to pushback, to back up your call flow with substance.' },
  { title: 'Troubleshooting guide', desc: 'Step-by-step fixes, useful for support and service agents.' },
  { title: 'Company fact sheet', desc: 'Hours, locations and certifications not already covered in Persona.' },
  { title: 'Past call transcripts', desc: 'Real customer questions, to surface edge cases your FAQ might miss.' },
];

const PURPOSE_PLACEHOLDER: Record<string, string> = {
  Healthcare: 'e.g. Confirm patient lab results and schedule follow-up visits',
  'E-commerce': 'e.g. Recover abandoned carts with a limited-time discount',
  Finance: 'e.g. Collect overdue EMI payments and agree a flexible plan',
  'Real Estate': 'e.g. Qualify inbound leads and book site visits',
  Education: 'e.g. Follow up with demo attendees to close enrolment',
  default: 'e.g. Book appointments for new and returning callers, and answer basic questions',
};

/* ═══════════════════════════════════════════════════════════════
   FORM STATE
   ═══════════════════════════════════════════════════════════════ */

export interface VariableRow { key: string; value: string }
export interface TransferNumber { label: string; number: string }

export const initialData = {
  /* ── Persona ── */
  companyName: '',
  agentName: '',
  industry: '',
  region: '',
  callDirection: 'Inbound',
  callPurpose: '',
  primaryLanguage: 'English',
  secondaryLanguage: 'None',
  voiceGender: 'Female',
  voiceTone: 'professional',

  /* ── Conversation ── */
  openingMessage: '',
  callFlow: '',
  variables: [] as VariableRow[],

  /* ── Knowledge base ── */
  kbEnabled: false,
  kbContent: '',

  /* ── Guardrails & call handling ── */
  discloseAI: true,
  recordingConsent: false,
  disclosureText: '',
  digressionHandling: 'Answer briefly, then resume the script',
  retryFallback: 'Transfer to a human agent',
  maxRetries: 2,
  liveTransferEnabled: false,
  transferNumbers: [{ label: '', number: '' }] as TransferNumber[],
  transferTriggers: [] as string[],
  afterHoursBehavior: '',
};

export type BuilderData = typeof initialData;

/* ═══════════════════════════════════════════════════════════════
   MODULES
   ═══════════════════════════════════════════════════════════════ */

export type ModuleId = 'persona' | 'settings' | 'objective' | 'conversation' | 'knowledge';

export const MODULES: Record<ModuleId, { label: string; icon: React.ElementType; blurb: string }> = {
  persona: { label: 'Persona', icon: UserCircle, blurb: 'Who the agent is and who it works for.' },
  settings: { label: 'Settings', icon: ShieldCheck, blurb: 'Boundaries, disclosures, fallbacks and human handoff.' },
  objective: { label: 'Call purpose + pre loaded data', icon: Target, blurb: 'Why the agent is calling and the data it needs.' },
  conversation: { label: 'Conversation', icon: MessageSquare, blurb: 'The opening and the flow.' },
  knowledge: { label: 'Knowledge Base & Guardrails', icon: BookOpen, blurb: 'Facts the agent answers from and rules it must follow.' },
};

export const MODULE_ORDER: ModuleId[] = ['persona', 'settings', 'objective', 'conversation', 'knowledge'];

export type Completion = 'empty' | 'partial' | 'complete';

export function getModuleCompletion(id: ModuleId, d: BuilderData): Completion {
  const score = (parts: unknown[]) => {
    const filled = parts.filter(Boolean).length;
    if (filled === 0) return 'empty' as const;
    return filled === parts.length ? ('complete' as const) : ('partial' as const);
  };
  switch (id) {
    case 'persona':
      return score([d.companyName.trim(), d.agentName.trim(), d.industry]);
    case 'settings': {
      const hasTransfer = d.liveTransferEnabled;
      if (!hasTransfer) return 'empty';
      const transferOk = d.transferNumbers.some((t) => t.number.trim());
      return transferOk ? 'complete' : 'partial';
    }
    case 'objective':
      return score([d.callPurpose.trim()]);
    case 'conversation':
      return score([d.openingMessage.trim(), d.callFlow.trim()]);
    case 'knowledge': {
      if (!d.kbEnabled) return 'empty';
      return d.kbContent.trim() ? 'complete' : 'partial';
    }
  }
}

export function getBlockingGaps(d: BuilderData): string[] {
  const gaps: string[] = [];
  if (!d.companyName.trim()) gaps.push('Company name (Persona)');
  if (!d.callPurpose.trim()) gaps.push('Call purpose (Call purpose + pre loaded data)');
  if (!d.callFlow.trim()) gaps.push('Call flow (Conversation)');
  if (d.kbEnabled && !d.kbContent.trim()) gaps.push('Knowledge base content (Knowledge Base & Guardrails)');
  if (d.liveTransferEnabled && !d.transferNumbers.some((t) => t.number.trim())) {
    gaps.push('At least one transfer number (Settings)');
  }
  return gaps;
}

export function getRequiredProgress(d: BuilderData) {
  const required = [
      !!d.companyName.trim(),
      !!d.callPurpose.trim(),
      !!d.callFlow.trim(),
  ];
  return Math.round((required.filter(Boolean).length / required.length) * 100);
}

/* ═══════════════════════════════════════════════════════════════
   PRIMITIVES
   ═══════════════════════════════════════════════════════════════ */

export function Label({ htmlFor, children, badge }: { htmlFor?: string; children: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="flex items-center gap-2 text-[14px] font-medium text-ink mb-1.5">
      <span>{children}</span>
      {badge}
    </label>
  );
}

export function Guide({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-[12px] leading-[1.5] text-graphite pt-1.5">
      <Info className="w-[13px] h-[13px] shrink-0 mt-[2px]" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

export function Hint({ tone, children }: { tone: 'ok' | 'warn' | 'idea'; children: React.ReactNode }) {
  const color = tone === 'warn' ? 'text-warning' : tone === 'ok' ? 'text-success' : 'text-faint';
  return (
    <p className={`flex items-center gap-1.5 text-[12px] pt-1 ${color}`}>
      <span aria-hidden="true">{tone === 'ok' ? '✓' : tone === 'warn' ? '!' : '○'}</span>
      <span>{children}</span>
    </p>
  );
}

export function GeneratedBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-line bg-subtle px-2 py-0.5 text-[11px] font-medium text-graphite">
      Drafted
    </span>
  );
}

export function StepDot({ status, index }: { status: Completion; index: number }) {
  const base = 'w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[10px] font-semibold tabular-nums';
  if (status === 'complete') {
      return <span className={`${base} bg-success text-white`}><Check className="w-3 h-3" strokeWidth="3" /></span>;
  }
  if (status === 'partial') {
      return <span className={`${base} bg-warning text-white`}>{index}</span>;
  }
  return <span className={`${base} border border-line-strong bg-surface text-graphite`}>{index}</span>;
}

export function CompletionDot({ status }: { status: Completion }) {
  const bg =
    status === 'complete' ? 'bg-success text-white'
      : status === 'partial' ? 'bg-warning text-white'
        : 'bg-line-strong text-transparent';
  return (
    <span className={`w-3 h-3 rounded-full shrink-0 flex items-center justify-center ${bg}`} aria-hidden="true">
      {status === 'complete' && <Check className="w-2 h-2" strokeWidth={4} />}
      {status === 'partial' && <Minus className="w-2 h-2" strokeWidth={4} />}
    </span>
  );
}

export function Toggle({ id, label, checked, onChange, onText = 'Yes', offText = 'No' }: {
  id: string; label: string; checked: boolean; onChange: (v: boolean) => void; onText?: string; offText?: string;
}) {
  return (
    <div>
      <span id={`${id}-label`} className="block text-[14px] font-medium text-ink mb-2.5">{label}</span>
      <label htmlFor={id} className="inline-flex items-center gap-3 cursor-pointer">
        <span className="relative inline-block w-11 h-6">
          <input
            id={id}
            type="checkbox"
            role="switch"
            aria-checked={checked}
            aria-labelledby={`${id}-label`}
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            className="peer sr-only"
          />
          <span className="absolute inset-0 rounded-full bg-line-strong transition-colors peer-checked:bg-ink peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2" />
          <span className="absolute top-1 left-1 h-4 w-4 rounded-full bg-surface transition-transform peer-checked:translate-x-5" />
        </span>
        <span className="text-[14px] font-medium text-ink">{checked ? onText : offText}</span>
      </label>
    </div>
  );
}

export function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <fieldset className="border-0 p-0 m-0">
      <legend className="block text-[14px] font-medium text-ink mb-1.5">{label}</legend>
      <div role="radiogroup" aria-label={label} className="inline-flex bg-subtle rounded-full p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={`px-4 py-1.5 rounded-full text-[14px] font-medium transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 ${
              value === o.value ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]' : 'text-graphite hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function ModuleHeader({ id }: { id: ModuleId }) {
  return (
    <header className="mb-6">
      <h2 className="text-[20px] font-semibold text-ink mb-1">{MODULES[id].label}</h2>
      <p className="text-[14px] text-graphite">{MODULES[id].blurb}</p>
    </header>
  );
}

export function NextButton({ label, onClick, busy, disabled = false }: { label: string; onClick: () => void; busy?: boolean; disabled?: boolean }) {
  return (
    <div className="pt-5 mt-2 border-t border-line flex justify-end">
      <button type="button" onClick={onClick} className="btn btn-primary" disabled={busy || disabled}>
        {busy ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Drafting…</> : <>{label} <ArrowRight className="w-4 h-4" aria-hidden="true" /></>}
      </button>
    </div>
  );
}

export function DraftButton({ onClick, busy, children }: { onClick: () => void; busy: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="link inline-flex items-center gap-1.5 text-[12px]"
    >
      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PERSONA SUMMARY CARD
   ═══════════════════════════════════════════════════════════════ */

export function PersonaCard({ data }: { data: BuilderData }) {
  const tone = TONE_OPTIONS.find((t) => t.id === data.voiceTone)?.label ?? 'Not set';
  const meta = [
    data.industry,
    `${data.voiceGender} · ${tone}`,
    data.secondaryLanguage !== 'None' ? `${data.primaryLanguage} + ${data.secondaryLanguage}` : data.primaryLanguage,
  ].filter(Boolean);

  return (
    <div className="card mb-6 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="min-w-0 truncate text-[14px] font-medium text-ink">
          {data.agentName || <span className="font-normal text-faint">Unnamed agent</span>}
          <span className="text-faint"> · </span>
          {data.companyName || <span className="font-normal text-faint">No company</span>}
          <span className="text-faint"> · </span>
          <span className={`text-[11px] px-2 py-0.5 rounded-full ${data.callDirection === 'Inbound' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'} font-medium`}>{data.callDirection}</span>
        </p>
        <p className="truncate text-[12px] text-graphite">{meta.join(' · ')}</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN FORM
   ═══════════════════════════════════════════════════════════════ */

type AutoField = 'openingMessage' | 'callFlow';

export interface BuilderFormProps {
  data: BuilderData;
  setData: React.Dispatch<React.SetStateAction<BuilderData>>;
  activeModule: ModuleId;
  setActiveModule: (m: ModuleId) => void;
  validationErrors: Record<string, boolean>;
  setValidationErrors: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}

export function BuilderForm({ data, setData, activeModule, setActiveModule, validationErrors, setValidationErrors }: BuilderFormProps) {
  const [drafting, setDrafting] = useState<AutoField[]>([]);
  const [drafted, setDrafted] = useState<AutoField[]>([]);
  const [draftError, setDraftError] = useState('');
  const [kbTipOpen, setKbTipOpen] = useState(false);
  const purposeAtLastDraft = useRef(data.callPurpose);

  const set = <K extends keyof BuilderData>(key: K, val: BuilderData[K]) =>
    setData((d) => ({ ...d, [key]: val }));

  const markTouched = (field: string) => {
    setValidationErrors((prev) => ({ ...prev, [field]: false }));
  };

  /**
   * Asks the model to draft the opening line, the plain-language call flow, and the
   * guardrails from the call purpose. Only fills fields the user left empty unless
   * `force` is set (the "Redraft" buttons), so typed content is never clobbered.
   */
  const runAutoFill = async (fields: AutoField[], force = false): Promise<void> => {
    if (!data.callPurpose.trim()) return;
    const targets = force ? fields : fields.filter((f) => !String(data[f] ?? '').trim());
    if (targets.length === 0) return;

    setDraftError('');
    setDrafting(targets);
    try {
      const res = await fetch('/api/builder/autofill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: targets, form: data }),
      });
      if (!res.ok) throw new Error('autofill failed');
      const out = await res.json();
      const applied = targets.filter((f) => typeof out?.[f] === 'string' && out[f].trim());
      if (applied.length > 0) {
        setData((d) => {
          const next = { ...d };
          applied.forEach((f) => { (next as Record<string, unknown>)[f] = String(out[f]).trim(); });
          return next;
        });
        setDrafted((prev) => Array.from(new Set([...prev, ...applied])));
      }
    } catch {
      setDraftError('Could not draft that automatically — you can still write it yourself.');
    } finally {
      setDrafting([]);
    }
  };

  const isDrafting = (f: AutoField) => drafting.includes(f);
  const wasDrafted = (f: AutoField) => drafted.includes(f);

  const goNext = async (from: ModuleId) => {
    if (from === 'objective') {
      const purposeChanged = data.callPurpose !== purposeAtLastDraft.current;
      if (purposeChanged) {
        await runAutoFill(['openingMessage', 'callFlow'], true);
        purposeAtLastDraft.current = data.callPurpose;
      } else {
        await runAutoFill(['openingMessage', 'callFlow']);
      }
    }
    const idx = MODULE_ORDER.indexOf(from);
    if (idx >= 0 && idx < MODULE_ORDER.length - 1) setActiveModule(MODULE_ORDER[idx + 1]);
  };

  /* ── array helpers ── */
  const addVariable = () => setData((d) => ({ ...d, variables: [...d.variables, { key: '', value: '' }] }));
  const updateVariable = (i: number, field: keyof VariableRow, val: string) =>
    setData((d) => ({ ...d, variables: d.variables.map((v, idx) => (idx === i ? { ...v, [field]: val } : v)) }));
  const removeVariable = (i: number) =>
    setData((d) => ({ ...d, variables: d.variables.filter((_, idx) => idx !== i) }));

  const addTransferNumber = () =>
    setData((d) => ({ ...d, transferNumbers: [...d.transferNumbers, { label: '', number: '' }] }));
  const updateTransferNumber = (i: number, field: keyof TransferNumber, val: string) =>
    setData((d) => ({ ...d, transferNumbers: d.transferNumbers.map((t, idx) => (idx === i ? { ...t, [field]: val } : t)) }));
  const removeTransferNumber = (i: number) =>
    setData((d) => ({ ...d, transferNumbers: d.transferNumbers.filter((_, idx) => idx !== i) }));

  const toggleTrigger = (trigger: string) =>
    setData((d) => ({
      ...d,
      transferTriggers: d.transferTriggers.includes(trigger)
        ? d.transferTriggers.filter((t) => t !== trigger)
        : [...d.transferTriggers, trigger],
    }));

  const draftErrorBanner = draftError ? (
    <p className="text-[12px] text-warning pt-1">{draftError}</p>
  ) : null;

  /* ─────────────────────────── PERSONA ─────────────────────────── */

  if (activeModule === 'persona') {
    return (
      <section className="card bg-white p-6 sm:p-8 shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-line rounded-2xl space-y-6" aria-labelledby="module-heading">
        <ModuleHeader id="persona" />

        <div>
            <Segmented label="Call direction" value={data.callDirection} onChange={(v) => set('callDirection', v)} options={[{ value: 'Inbound', label: 'Inbound' }, { value: 'Outbound', label: 'Outbound' }]} />
            <Guide>Inbound agents answer calls from customers. Outbound agents make calls to prospects or existing customers.</Guide>
        </div>

        <div className="my-6 h-px bg-line" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="companyName">Company name *</Label>
            <input
                id="companyName"
                className={`input-field ${validationErrors.companyName ? 'error' : ''}`}
                value={data.companyName}
                onChange={(e) => { set('companyName', e.target.value); markTouched('companyName'); }}
                onBlur={() => setValidationErrors((prev) => ({ ...prev, companyName: !data.companyName.trim() }))}
                placeholder="e.g. Meridian Dental"
            />
            {validationErrors.companyName && <p className="text-[12px] text-danger pt-1">Company name is required</p>}
            <Guide>Used in greetings, disclosures and every reference to &quot;us&quot;.</Guide>
          </div>
          <div>
            <Label htmlFor="agentName">Agent name</Label>
            <input id="agentName" className="input-field" value={data.agentName} onChange={(e) => set('agentName', e.target.value)} placeholder="e.g. Ava" />
            {!data.agentName && data.companyName ? <Hint tone="idea">A named agent builds trust faster than an anonymous one.</Hint> : <Guide>The name the agent introduces itself with.</Guide>}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="industry">Industry</Label>
            <select id="industry" className="input-field" value={data.industry} onChange={(e) => set('industry', e.target.value)}>
              <option value="">Select industry…</option>
              {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="region">Deployment region</Label>
            <select id="region" className="input-field" value={data.region} onChange={(e) => set('region', e.target.value)}>
              {REGIONS.map((r) => <option key={r.code || 'none'} value={r.code}>{r.label}</option>)}
            </select>
            <Guide>Sets currency, emergency numbers and phone-number length. Left blank, the agent stays deliberately generic.</Guide>
          </div>
        </div>


        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="primaryLanguage">Primary language</Label>
            <select id="primaryLanguage" className="input-field" value={data.primaryLanguage} onChange={(e) => set('primaryLanguage', e.target.value)}>
              {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="secondaryLanguage">Secondary language</Label>
            <select id="secondaryLanguage" className="input-field" value={data.secondaryLanguage} onChange={(e) => set('secondaryLanguage', e.target.value)}>
              <option value="None">None</option>
              {LANGUAGES.filter((l) => l !== data.primaryLanguage).map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <Guide>Adding one puts the agent in multilingual mode — it mirrors whichever language the caller uses.</Guide>
          </div>
        </div>

        <Segmented label="Voice gender" value={data.voiceGender} onChange={(v) => set('voiceGender', v)} options={[{ value: 'Female', label: 'Female' }, { value: 'Male', label: 'Male' }]} />

        <fieldset className="border-0 p-0 m-0">
            <legend className="block text-[14px] font-medium text-ink mb-2">Voice tone</legend>
            <div role="radiogroup" aria-label="Voice tone" className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {TONE_OPTIONS.map((t) => (
                    <button key={t.id} type="button" role="radio" aria-checked={data.voiceTone === t.id} onClick={() => set('voiceTone', t.id)}
                        className={`rounded-md border px-3 py-2 text-left text-[13px] transition-colors ${data.voiceTone === t.id ? 'border-ink bg-subtle text-ink' : 'border-line bg-surface text-graphite hover:border-line-strong hover:text-ink'
                            }`}>
                        <span className="block font-medium">{t.label}</span>
                        <span className="mt-0.5 block text-[11px] text-faint">{t.desc}</span>
                    </button>
                ))}
            </div>
        </fieldset>

        {draftErrorBanner}
        <NextButton label="Next: Settings" onClick={() => goNext('persona')} />
      </section>
    );
  }

  /* ─────────────────────────── SETTINGS ─────────────────────────── */

  if (activeModule === 'settings') {
    return (
      <section className="card bg-white p-6 sm:p-8 shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-line rounded-2xl space-y-6" aria-labelledby="module-heading">
        <ModuleHeader id="settings" />

        <div>
            <h3 className="text-[14px] font-semibold text-ink mb-4">Disclosure &amp; compliance</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <Toggle id="discloseAI" label="Disclose AI identity to the caller" checked={data.discloseAI} onChange={(v) => set('discloseAI', v)} />
                <Toggle id="recordingConsent" label="Recording consent required" checked={data.recordingConsent} onChange={(v) => set('recordingConsent', v)} />
            </div>
            {data.recordingConsent && (
                <div className="mt-4">
                    <Label htmlFor="disclosureText">Exact disclosure line</Label>
                    <input id="disclosureText" className="input-field" value={data.disclosureText} onChange={(e) => set('disclosureText', e.target.value)} placeholder="This call may be recorded for quality and training purposes." />
                    <Guide>Leave blank and the agent will phrase it itself.</Guide>
                </div>
            )}
        </div>

        <div className="my-6 h-px bg-line" />

        <div>
            <h3 className="text-[14px] font-semibold text-ink mb-4">Handling off-topic questions</h3>
            <div className="space-y-4">
                <div>
                    <Label htmlFor="digressionHandling">When the caller asks something unrelated</Label>
                    <select id="digressionHandling" className="input-field" value={data.digressionHandling} onChange={(e) => set('digressionHandling', e.target.value)}>
                        <option>Answer briefly, then resume the script</option>
                        <option>Note it and continue the script only</option>
                        <option>Refuse and redirect to the script</option>
                    </select>
                    <Guide>What happens when the caller asks something off-flow mid-conversation.</Guide>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <Label htmlFor="retryFallback">If the AI doesn&apos;t understand the caller</Label>
                        <select id="retryFallback" className="input-field" value={data.retryFallback} onChange={(e) => set('retryFallback', e.target.value)}>
                            <option>Transfer to a human agent</option>
                            <option>End the call politely</option>
                            <option>Offer a callback</option>
                            <option>Repeat the request differently</option>
                        </select>
                    </div>
                    <div>
                        <Label htmlFor="maxRetries">Number of attempts before fallback</Label>
                        <input id="maxRetries" type="number" min="1" max="5" className="input-field font-mono" value={data.maxRetries} onChange={(e) => set('maxRetries', Math.min(5, Math.max(1, Number(e.target.value) || 1)))} />
                        <Guide>How many times the agent rephrases and retries before using the fallback above.</Guide>
                    </div>
                </div>
            </div>
        </div>

        <div className="my-6 h-px bg-line" />

        <div>
            <h3 className="text-[14px] font-semibold text-ink mb-4">Live transfer &amp; escalation</h3>
            <Toggle id="liveTransferEnabled" label="Enable live transfer" checked={data.liveTransferEnabled} onChange={(v) => set('liveTransferEnabled', v)} onText="Enabled" offText="Disabled" />
            {data.liveTransferEnabled && (
                <div className="mt-4 space-y-6 rounded-lg border border-line bg-surface p-4">
                    <div>
                        <span className="block text-[14px] font-medium text-ink mb-3">Transfer numbers</span>
                        <div className="space-y-3">
                            {data.transferNumbers.map((t, i) => (
                                <div key={i} className="flex gap-2">
                                    <input className="input-field flex-1" placeholder="Label (e.g. Front desk)" value={t.label} onChange={(e) => updateTransferNumber(i, 'label', e.target.value)} />
                                    <input className="input-field flex-1 font-mono text-[13px]" placeholder={`${REGION_PHONE_CODES[data.region] || '+1'} 415 555 0142`} value={t.number} onChange={(e) => updateTransferNumber(i, 'number', e.target.value)} />
                                    {data.transferNumbers.length > 1 && (
                                        <button type="button" onClick={() => removeTransferNumber(i)} aria-label="Remove this number" className="icon-btn shrink-0">
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                        <button type="button" onClick={addTransferNumber} className="link mt-3 inline-flex items-center gap-1.5 text-[13px]"><Plus className="w-4 h-4" /> Add number</button>
                    </div>

                    <fieldset className="border-0 p-0 m-0">
                        <legend className="block text-[14px] font-medium text-ink mb-3">Transfer when…</legend>
                        <div className="flex flex-wrap gap-2">
                            {TRANSFER_TRIGGERS.map((trigger) => {
                                const active = data.transferTriggers.includes(trigger);
                                return (
                                    <button key={trigger} type="button" role="checkbox" aria-checked={active} onClick={() => toggleTrigger(trigger)}
                                        className={`px-3 py-1.5 text-[13px] rounded-lg border transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 ${active ? 'border-ink bg-subtle font-medium text-ink' : 'border-line bg-surface text-graphite hover:border-line-strong hover:text-ink'
                                            }`}>
                                        {trigger}
                                    </button>
                                );
                            })}
                        </div>
                    </fieldset>

                    <div>
                        <Label htmlFor="afterHoursBehavior">If nobody can take the transfer</Label>
                        <textarea id="afterHoursBehavior" className="input-field resize-y" rows={2} value={data.afterHoursBehavior} onChange={(e) => set('afterHoursBehavior', e.target.value)} placeholder="e.g. Take a message and confirm a callback window" />
                    </div>
                </div>
            )}
        </div>

        <NextButton label="Next: Call purpose + pre loaded data" onClick={() => goNext('settings')} />
      </section>
    );
  }

  /* ─────────────────────────── OBJECTIVE ─────────────────────────── */

  if (activeModule === 'objective') {
    return (
      <section className="card bg-white p-6 sm:p-8 shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-line rounded-2xl space-y-6" aria-labelledby="module-heading">
        <ModuleHeader id="objective" />

        <div>
            <Label htmlFor="callPurpose">Call purpose *</Label>
            <textarea
                id="callPurpose"
                className={`input-field resize-y ${validationErrors.callPurpose ? 'error' : ''}`}
                rows={4}
                value={data.callPurpose}
                onChange={(e) => { set('callPurpose', e.target.value); markTouched('callPurpose'); }}
                onBlur={() => setValidationErrors((prev) => ({ ...prev, callPurpose: !data.callPurpose.trim() }))}
                placeholder={PURPOSE_PLACEHOLDER[data.industry] || PURPOSE_PLACEHOLDER.default}
            />
            {validationErrors.callPurpose && <p className="text-[12px] text-danger pt-1">Call purpose is required</p>}
            {data.callPurpose.trim().length > 0 && data.callPurpose.trim().length < 20 ? <Hint tone="warn">This is thin — add the outcome you expect from the call.</Hint> : data.callPurpose.trim().length >= 20 ? <Hint tone="ok">Good specificity.</Hint> : null}
            <Guide>Everything downstream keys off this — your opening line, call flow and guardrails are drafted from it when you move to the next section.</Guide>
        </div>

        <div className="my-6 h-px bg-line" />

        <div>
            <span className="block text-[14px] font-medium text-ink mb-1.5">Pre-loaded customer data</span>
            <p className="text-[12px] text-graphite mb-3">What information does your system already have about the caller before they pick up? The agent will reference this automatically.</p>

            {data.variables.length === 0 && (
                <div className="mb-3 rounded-lg border border-dashed border-line bg-subtle/50 p-4">
                    <p className="text-[13px] text-graphite mb-3">No pre-loaded data yet. Example of what you could add:</p>
                    <div className="flex gap-3 items-start opacity-50 pointer-events-none select-none">
                        <div className="flex-1 grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="block text-[12px] font-medium text-ink">Field name</label>
                                <input className="input-field w-full" value="Full Name" readOnly tabIndex={-1} />
                                <p className="text-[11px] text-faint ml-1">
                                    Agent will see this as: <code className="text-ink bg-canvas px-1.5 py-0.5 rounded font-mono font-medium">{'{{full_name}}'}</code>
                                </p>
                            </div>
                            <div className="space-y-1.5">
                                <label className="block text-[12px] font-medium text-ink">Example value</label>
                                <input className="input-field w-full" value="John Doe" readOnly tabIndex={-1} />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="space-y-3">
                {data.variables.map((v, i) => {
                    const agentVar = formatVariableKey(v.key);
                    return (
                        <div key={i} className="flex gap-3 items-start">
                            <div className="flex-1 grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    {i === 0 && <label className="block text-[12px] font-medium text-ink">Field name</label>}
                                    <input className="input-field w-full" placeholder="e.g. First Name" value={v.key} onChange={(e) => updateVariable(i, 'key', e.target.value)} />
                                    {agentVar && (
                                        <p className="text-[11px] text-faint ml-1">
                                            Agent will see this as: <code className="text-ink bg-canvas px-1.5 py-0.5 rounded font-mono font-medium">{agentVar}</code>
                                        </p>
                                    )}
                                </div>
                                <div className="space-y-1.5">
                                    {i === 0 && <label className="block text-[12px] font-medium text-ink">Example value</label>}
                                    <input className="input-field w-full" placeholder="e.g. John" value={v.value} onChange={(e) => updateVariable(i, 'value', e.target.value)} />
                                </div>
                            </div>
                            <button type="button" onClick={() => removeVariable(i)} aria-label="Remove this field" className={`p-2.5 text-graphite hover:text-danger hover:bg-danger/10 rounded-md transition-colors shrink-0 ${i === 0 ? 'mt-[22px]' : 'mt-0'}`}>
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    );
                })}
            </div>
            <button type="button" onClick={addVariable} className="link mt-3 inline-flex items-center gap-1.5 text-[13px]"><Plus className="w-4 h-4" /> Add field</button>
        </div>

        {draftErrorBanner}
        <NextButton label="Next: Conversation" onClick={() => goNext('objective')} busy={drafting.length > 0} disabled={!data.callPurpose.trim()} />
      </section>
    );
  }

  /* ─────────────────────────── CONVERSATION ─────────────────────────── */

  if (activeModule === 'conversation') {
    return (
      <section className="card bg-white p-6 sm:p-8 shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-line rounded-2xl space-y-6" aria-labelledby="module-heading">
        <ModuleHeader id="conversation" />

        {!data.callPurpose.trim() && (
            <div className="card bg-subtle px-4 py-3 text-[13px] text-graphite">
                Add a call purpose in <button type="button" className="underline font-medium" onClick={() => setActiveModule('objective')}>Call purpose + pre loaded data</button> and we will draft the opening message, call flow and guardrails for you.
            </div>
        )}

        <div>
            <Label htmlFor="openingMessage" badge={wasDrafted('openingMessage') ? <GeneratedBadge /> : undefined}>Opening message</Label>
            <textarea id="openingMessage" className="input-field resize-y" rows={3} value={data.openingMessage} onChange={(e) => set('openingMessage', e.target.value)}
                placeholder={data.callDirection === 'Inbound' ? "Hi, this is Ava from Meridian Dental — how can I help today?" : "Hi, this is Ava calling from Meridian Dental about your recent inquiry — do you have a quick minute?"}
            />
            {data.openingMessage && data.companyName && !data.openingMessage.includes(data.companyName) ? <Hint tone="idea">Naming {data.companyName} in the opener measurably increases engagement.</Hint> : null}
            <div className="flex items-center justify-between gap-4 pt-1">
                <Guide>The first five seconds decide whether the caller stays. Say who you are and why you are calling.</Guide>
                <DraftButton busy={isDrafting('openingMessage')} onClick={() => runAutoFill(['openingMessage'], true)}>Redraft</DraftButton>
            </div>
        </div>

        <div>
            <Label htmlFor="callFlow" badge={wasDrafted('callFlow') ? <GeneratedBadge /> : undefined}>Call flow *</Label>
            <p className="text-[12px] text-graphite mb-2">Plain language, one goal per line — this is a sketch for you, not the prompt. The system turns it into the full conversation with branching, retries and confirmations.</p>
            <textarea
                id="callFlow"
                className={`input-field resize-y font-mono text-[13px] ${validationErrors.callFlow ? 'error' : ''}`}
                rows={9}
                value={data.callFlow}
                onChange={(e) => { set('callFlow', e.target.value); markTouched('callFlow'); }}
                onBlur={() => setValidationErrors((prev) => ({ ...prev, callFlow: !data.callFlow.trim() }))}
                placeholder={'1. Greet and introduce yourself\n2. Ask what the caller needs\n3. Collect the details you need\n4. Answer questions from the knowledge base\n5. Confirm next steps and close'}
            />
            {validationErrors.callFlow && <p className="text-[12px] text-danger pt-1">Call flow is required — write a few steps or use Redraft to draft them from your call purpose.</p>}
            {!validationErrors.callFlow && !data.callFlow.trim() && <Hint tone="warn">Required — write a few steps, or use Redraft to draft them from your call purpose.</Hint>}
            <div className="flex items-center justify-between gap-4 pt-1">
                <Guide>Four to eight steps works best. Include the close.</Guide>
                <DraftButton busy={isDrafting('callFlow')} onClick={() => runAutoFill(['callFlow'], true)}>Redraft</DraftButton>
            </div>
        </div>


        {draftErrorBanner}
        <NextButton label="Next: Knowledge Base & Guardrails" onClick={() => goNext('conversation')} busy={drafting.length > 0} disabled={!data.callFlow.trim()} />
      </section>
    );
  }

  /* ─────────────────────────── KNOWLEDGE BASE ─────────────────────────── */

  if (activeModule === 'knowledge') {
    return (
      <section className="card bg-white p-6 sm:p-8 shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-line rounded-2xl space-y-6" aria-labelledby="module-heading">
        <ModuleHeader id="knowledge" />
        <div className="card space-y-4 p-4">
            <div className="flex items-start justify-between gap-4">
                <Toggle id="kbEnabled" label="Enable knowledge base" checked={data.kbEnabled} onChange={(v) => set('kbEnabled', v)} />
                <div className="relative">
                    <button type="button" onClick={() => setKbTipOpen((o) => !o)} onMouseEnter={() => setKbTipOpen(true)} onMouseLeave={() => setKbTipOpen(false)} className="link inline-flex items-center gap-1.5 text-[12px]">
                        <Info className="w-4 h-4" /> What should I add here?
                    </button>
                    {kbTipOpen && (
                        <div className="absolute right-0 top-full mt-2 z-30 w-[min(92vw,26rem)] rounded-lg border border-line glass-modal p-4 animate-fade-in-up">
                            <div className="flex items-start justify-between gap-3 mb-2">
                                <p className="text-[13px] font-semibold text-ink">Anything factual the agent might be asked</p>
                                <button type="button" onClick={() => setKbTipOpen(false)} className="text-faint hover:text-ink"><X className="w-4 h-4" /></button>
                            </div>
                            <p className="text-[12px] text-graphite mb-3">The system reads this and files each fact into the right part of the prompt — business facts, FAQ answers, policies and objection handling.</p>
                            <ul className="space-y-2">
                                {KB_SOURCE_HINTS.map((h, i) => (
                                    <li key={i} className="text-[12px] leading-[1.5]">
                                        <span className="font-medium text-ink">{h.title}</span><span className="text-graphite"> — {h.desc}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>
            {data.kbEnabled ? (
                <div className="space-y-4">
                    <div>
                        <Label>Upload documents</Label>
                        <p className="text-[12px] text-graphite mb-2">Drop your FAQ docs, pricing sheets, policy files, or past call transcripts. Text is extracted and added to the content box below.</p>
                        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line bg-subtle px-4 py-6 opacity-60 cursor-not-allowed">
                          <p className="text-[13px] text-graphite text-center">File upload coming soon — please paste text below for this demo</p>
                        </div>
                    </div>
                    <div className="my-2 h-px bg-line" />
                    <div>
                        <Label htmlFor="kbContent">Knowledge base content</Label>
                        <textarea id="kbContent" className="input-field resize-y" rows={14} value={data.kbContent} onChange={(e) => set('kbContent', e.target.value)} placeholder="Paste your FAQs, pricing sheet, policies, objection notes, troubleshooting steps, hours and locations — raw text is fine, it does not need formatting." />
                        {data.kbContent.trim() && (
                            <p className="text-[11px] text-faint pt-1 tabular-nums">{data.kbContent.length.toLocaleString()} chars</p>
                        )}
                        <Guide>Raw and messy is fine. Facts get extracted and routed into the prompt automatically; nothing is pasted in verbatim. Uploaded file text appears here — feel free to edit.</Guide>
                    </div>
                </div>
            ) : (
                <p className="text-[13px] text-graphite">Optional. Without it the agent answers only from the Persona and Conversation sections, and says it does not have the detail for anything else — which is safe, just less useful.</p>
            )}
        </div>
        
      </section>
    );
  }

  return null;
}
