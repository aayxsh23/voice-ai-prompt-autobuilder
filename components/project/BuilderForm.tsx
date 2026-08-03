'use client';

import React, { useCallback, useState } from 'react';
import { FileUploadZone, type UploadedFile } from './FileUploadZone';
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
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   STATIC OPTION LISTS
   ═══════════════════════════════════════════════════════════════ */

const INDUSTRIES = [
  'E-commerce', 'Healthcare', 'Finance', 'Real Estate', 'Education',
  'Insurance', 'SaaS', 'Travel & Hospitality', 'Logistics', 'Other',
];

const LANGUAGES = ['English', 'Hindi', 'Spanish', 'French', 'German'];

/**
 * Deployment region. This is the ONE piece of location data the compiler needs:
 * it gates emergency numbers, currency and phone-digit validation
 * (see lib/compiler/assembler/PromptAssembler.ts). Left blank the compiler stays
 * deliberately generic rather than assuming a country.
 */
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

/**
 * Shown as the Knowledge Base tooltip. The compiler runs an extraction pass over
 * whatever is pasted here and routes the facts into the right prompt sections
 * (see lib/compiler/planners/KnowledgeExtractor.ts) — so this list doubles as the
 * spec for what the extractor looks for.
 */
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
  guardrails: '',
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

export type ModuleId = 'persona' | 'conversation' | 'knowledge' | 'rules';

export const MODULES: Record<ModuleId, { label: string; icon: React.ElementType; blurb: string }> = {
  persona: { label: 'Persona', icon: UserCircle, blurb: 'Who the agent is, who it works for, and why it is calling.' },
  conversation: { label: 'Conversation', icon: MessageSquare, blurb: 'The opening, the flow, and the data injected per call.' },
  knowledge: { label: 'Knowledge Base', icon: BookOpen, blurb: 'Facts the agent answers from instead of guessing.' },
  rules: { label: 'Guardrails & Call Handling', icon: ShieldCheck, blurb: 'Boundaries, disclosures, fallbacks and human handoff.' },
};

export const MODULE_ORDER: ModuleId[] = ['persona', 'conversation', 'knowledge', 'rules'];

export type Completion = 'empty' | 'partial' | 'complete';

export function getModuleCompletion(id: ModuleId, d: BuilderData): Completion {
  const score = (parts: unknown[]) => {
    const filled = parts.filter(Boolean).length;
    if (filled === 0) return 'empty' as const;
    return filled === parts.length ? ('complete' as const) : ('partial' as const);
  };
  switch (id) {
    case 'persona':
      return score([d.companyName.trim(), d.agentName.trim(), d.industry, d.callPurpose.trim()]);
    case 'conversation':
      return score([d.openingMessage.trim(), d.callFlow.trim()]);
    case 'knowledge':
      if (!d.kbEnabled) return 'empty';
      return d.kbContent.trim() ? 'complete' : 'partial';
    case 'rules': {
      const hasGuardrails = !!d.guardrails.trim();
      const hasTransfer = d.liveTransferEnabled;
      
      // If they haven't typed guardrails and haven't enabled transfer, it's untouched.
      if (!hasGuardrails && !hasTransfer) return 'empty';
      
      // If they enabled transfer, they must provide at least one valid number
      const transferOk = !hasTransfer || d.transferNumbers.some((t) => t.number.trim());
      
      return (hasGuardrails && transferOk) ? 'complete' : 'partial';
    }
  }
}

/** Blocks submission — everything else the compiler can reason its way through. */
export function getBlockingGaps(d: BuilderData): string[] {
  const gaps: string[] = [];
  if (!d.companyName.trim()) gaps.push('Company name (Persona)');
  if (!d.callPurpose.trim()) gaps.push('Call purpose (Persona)');
  if (!d.callFlow.trim()) gaps.push('Call flow (Conversation)');
  if (d.kbEnabled && !d.kbContent.trim()) gaps.push('Knowledge base content (Knowledge Base)');
  if (d.liveTransferEnabled && !d.transferNumbers.some((t) => t.number.trim())) {
    gaps.push('At least one transfer number (Guardrails & Call Handling)');
  }
  return gaps;
}

/* ═══════════════════════════════════════════════════════════════
   PRIMITIVES
   ═══════════════════════════════════════════════════════════════ */

function Label({ htmlFor, children, badge }: { htmlFor?: string; children: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="flex items-center gap-2 text-[14px] font-medium text-ink mb-1.5">
      <span>{children}</span>
      {badge}
    </label>
  );
}

function Guide({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-[12px] leading-[1.5] text-faint pt-1.5">
      <Info className="w-[13px] h-[13px] shrink-0 mt-[2px]" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

function Hint({ tone, children }: { tone: 'ok' | 'warn' | 'idea'; children: React.ReactNode }) {
  const color = tone === 'warn' ? 'text-warning' : tone === 'ok' ? 'text-success' : 'text-faint';
  return (
    <p className={`flex items-center gap-1.5 text-[12px] pt-1 ${color}`}>
      <span aria-hidden="true">{tone === 'ok' ? '✓' : tone === 'warn' ? '!' : '○'}</span>
      <span>{children}</span>
    </p>
  );
}

function GeneratedBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-line bg-subtle px-2 py-0.5 text-[11px] font-medium text-graphite">
      Drafted
    </span>
  );
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

function Toggle({ id, label, checked, onChange, onText = 'Yes', offText = 'No' }: {
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

function Segmented<T extends string>({ label, value, options, onChange }: {
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

function ModuleHeader({ id }: { id: ModuleId }) {
  return (
    <header className="mb-6">
      <h2 className="text-[20px] font-semibold text-ink mb-1">{MODULES[id].label}</h2>
      <p className="text-[14px] text-graphite">{MODULES[id].blurb}</p>
    </header>
  );
}

function NextButton({ label, onClick, busy }: { label: string; onClick: () => void; busy?: boolean }) {
  return (
    <div className="pt-5 mt-2 border-t border-line flex justify-end">
      <button type="button" onClick={onClick} className="btn btn-primary" disabled={busy}>
        {busy ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Drafting…</> : <>{label} <ArrowRight className="w-4 h-4" aria-hidden="true" /></>}
      </button>
    </div>
  );
}

function DraftButton({ onClick, busy, children }: { onClick: () => void; busy: boolean; children: React.ReactNode }) {
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
        </p>
        <p className="truncate text-[12px] text-graphite">{meta.join(' · ')}</p>
      </div>
      {data.callPurpose && (
        <p className="mt-2 line-clamp-2 border-t border-line pt-2 text-[13px] leading-[1.45] text-graphite">
          {data.callPurpose}
        </p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN FORM
   ═══════════════════════════════════════════════════════════════ */

type AutoField = 'openingMessage' | 'callFlow' | 'guardrails';

interface BuilderFormProps {
  data: BuilderData;
  setData: React.Dispatch<React.SetStateAction<BuilderData>>;
  activeModule: ModuleId;
  setActiveModule: (m: ModuleId) => void;
}

export function BuilderForm({ data, setData, activeModule, setActiveModule }: BuilderFormProps) {
  const [drafting, setDrafting] = useState<AutoField[]>([]);
  const [drafted, setDrafted] = useState<AutoField[]>([]);
  const [draftError, setDraftError] = useState('');
  const [kbTipOpen, setKbTipOpen] = useState(false);
  const [kbFiles, setKbFiles] = useState<UploadedFile[]>([]);

  /** Append extracted file text to kbContent with a labelled separator. */
  const handleFileText = useCallback(
    (text: string, filename: string) => {
      setData((d) => {
        const separator = `\n\n--- Uploaded: ${filename} ---\n\n`;
        const combined = d.kbContent.trim()
          ? d.kbContent + separator + text
          : text;
        return { ...d, kbContent: combined, kbEnabled: true };
      });
    },
    [setData],
  );

  /** Remove a file's extracted text from kbContent when it is deleted. */
  const handleFileRemoved = useCallback(
    (file: UploadedFile) => {
      setData((d) => {
        // Escape filename for regex
        const escapedName = file.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Match from this file's separator up to the next separator or the end of the string
        const regex = new RegExp(`\\n*--- Uploaded: ${escapedName} ---\\n*[\\s\\S]*?(?=\\n*--- Uploaded:|$)`, 'g');
        
        const newContent = d.kbContent.replace(regex, '');
        return { ...d, kbContent: newContent.trim() };
      });
    },
    [setData],
  );

  const set = <K extends keyof BuilderData>(key: K, val: BuilderData[K]) =>
    setData((d) => ({ ...d, [key]: val }));

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
          applied.forEach((f) => { next[f] = String(out[f]).trim(); });
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
    if (from === 'persona') await runAutoFill(['openingMessage', 'callFlow']);
    if (from === 'conversation') await runAutoFill(['guardrails']);
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
      <section className="space-y-5" aria-labelledby="module-heading">
        <ModuleHeader id="persona" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="companyName">Company name *</Label>
            <input id="companyName" className="input-field" value={data.companyName}
              onChange={(e) => set('companyName', e.target.value)} placeholder="e.g. Meridian Dental" />
            <Guide>Used in greetings, disclosures and every reference to “us”.</Guide>
          </div>
          <div>
            <Label htmlFor="agentName">Agent name</Label>
            <input id="agentName" className="input-field" value={data.agentName}
              onChange={(e) => set('agentName', e.target.value)} placeholder="e.g. Ava" />
            {!data.agentName && data.companyName
              ? <Hint tone="idea">A named agent builds trust faster than an anonymous one.</Hint>
              : <Guide>The name the agent introduces itself with.</Guide>}
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

        <div>
          <Segmented
            label="Call direction"
            value={data.callDirection}
            onChange={(v) => set('callDirection', v)}
            options={[{ value: 'Inbound', label: 'Inbound' }, { value: 'Outbound', label: 'Outbound' }]}
          />
        </div>

        <div>
          <Label htmlFor="callPurpose">Call purpose *</Label>
          <textarea id="callPurpose" className="input-field resize-y" rows={3} value={data.callPurpose}
            onChange={(e) => set('callPurpose', e.target.value)}
            placeholder={PURPOSE_PLACEHOLDER[data.industry] || PURPOSE_PLACEHOLDER.default} />
          {data.callPurpose.trim().length > 0 && data.callPurpose.trim().length < 20
            ? <Hint tone="warn">This is thin — add the outcome you expect from the call.</Hint>
            : data.callPurpose.trim().length >= 20
              ? <Hint tone="ok">Good specificity.</Hint>
              : null}
          <Guide>
            Everything downstream keys off this — your opening line, call flow and guardrails are drafted from it
            when you move to the next section.
          </Guide>
        </div>

        <div className="my-6 h-px bg-line" />

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

        <div>
          <Segmented
            label="Voice gender"
            value={data.voiceGender}
            onChange={(v) => set('voiceGender', v)}
            options={[{ value: 'Female', label: 'Female' }, { value: 'Male', label: 'Male' }]}
          />
        </div>

        <fieldset className="border-0 p-0 m-0">
          <legend className="block text-[14px] font-medium text-ink mb-2">Voice tone</legend>
          <div role="radiogroup" aria-label="Voice tone" className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {TONE_OPTIONS.map((t) => (
              <button key={t.id} type="button" role="radio" aria-checked={data.voiceTone === t.id}
                onClick={() => set('voiceTone', t.id)}
                className={`rounded-md border px-3 py-2 text-left text-[13px] transition-colors ${
                  data.voiceTone === t.id
                    ? 'border-ink bg-subtle text-ink'
                    : 'border-line bg-surface text-graphite hover:border-line-strong hover:text-ink'
                }`}>
                <span className="block font-medium">{t.label}</span>
                <span className="mt-0.5 block text-[11px] text-faint">{t.desc}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {draftErrorBanner}
        <NextButton label="Next: Conversation" onClick={() => void goNext('persona')} busy={drafting.length > 0} />
      </section>
    );
  }

  /* ──────────────────────── CONVERSATION ──────────────────────── */

  if (activeModule === 'conversation') {
    return (
      <section className="space-y-5" aria-labelledby="module-heading">
        <ModuleHeader id="conversation" />

        {!data.callPurpose.trim() && (
          <div className="card bg-subtle px-4 py-3 text-[13px] text-graphite">
            Add a call purpose in <button type="button" className="underline font-medium" onClick={() => setActiveModule('persona')}>Persona</button> and
            we will draft the opening message, call flow and guardrails for you.
          </div>
        )}

        <div>
          <Label htmlFor="openingMessage" badge={wasDrafted('openingMessage') ? <GeneratedBadge /> : undefined}>Opening message</Label>
          <textarea id="openingMessage" className="input-field resize-y" rows={3} value={data.openingMessage}
            onChange={(e) => set('openingMessage', e.target.value)}
            placeholder="Hi, this is Ava from Meridian Dental — how can I help today?" />
          {data.openingMessage && data.companyName && !data.openingMessage.includes(data.companyName)
            ? <Hint tone="idea">Naming {data.companyName} in the opener measurably increases engagement.</Hint>
            : null}
          <div className="flex items-center justify-between gap-4 pt-1">
            <Guide>The first five seconds decide whether the caller stays. Say who you are and why you are calling.</Guide>
            <DraftButton busy={isDrafting('openingMessage')} onClick={() => void runAutoFill(['openingMessage'], true)}>Redraft</DraftButton>
          </div>
        </div>

        <div>
          <Label htmlFor="callFlow" badge={wasDrafted('callFlow') ? <GeneratedBadge /> : undefined}>Call flow *</Label>
          <p className="text-[12px] text-faint mb-2">
            Plain language, one goal per line — this is a sketch for you, not the prompt. The compiler turns it into
            the full state machine with branching, retries and confirmations.
          </p>
          <textarea id="callFlow" className="input-field resize-y font-mono text-[13px]" rows={9} value={data.callFlow}
            onChange={(e) => set('callFlow', e.target.value)}
            placeholder={'1. Greet and introduce yourself\n2. Ask what the caller needs\n3. Collect the details you need\n4. Answer questions from the knowledge base\n5. Confirm next steps and close'} />
          <div className="flex items-center justify-between gap-4 pt-1">
            <Guide>Four to eight steps works best. Include the close.</Guide>
            <DraftButton busy={isDrafting('callFlow')} onClick={() => void runAutoFill(['callFlow'], true)}>Redraft</DraftButton>
          </div>
        </div>

        <div className="my-6 h-px bg-line" />

        <div>
          <span className="block text-[14px] font-medium text-ink mb-1.5">Variables</span>
          <p className="text-[12px] text-faint mb-3">
            Data your system already knows before the call and injects into the conversation. Reference them as{' '}
            <code className="font-mono text-ink-soft">{'{{variable_name}}'}</code> in the opening message or call flow.
            Anything the agent has to <em>ask</em> for does not belong here — the compiler derives those from your flow.
          </p>

          {data.variables.length === 0 && (
            <p className="text-[13px] text-faint mb-3 italic">No variables yet — the agent will run without pre-call context.</p>
          )}

          <div className="space-y-2">
            {data.variables.map((v, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  className="input-field w-2/5 font-mono text-[13px]"
                  aria-label={`Variable name ${i + 1}`}
                  placeholder="customer_name"
                  value={v.key}
                  onChange={(e) => updateVariable(i, 'key', e.target.value.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase())}
                />
                <input
                  className="input-field flex-1 text-[13px]"
                  aria-label={`Variable sample value ${i + 1}`}
                  placeholder="Sample value (e.g. Priya)"
                  value={v.value}
                  onChange={(e) => updateVariable(i, 'value', e.target.value)}
                />
                <button type="button" aria-label={`Remove variable ${i + 1}`} onClick={() => removeVariable(i)}
                  className="p-2 text-faint hover:text-ink transition-colors shrink-0">
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>

          <button type="button" onClick={addVariable} className="link mt-3 inline-flex items-center gap-1.5 text-[13px]">
            <Plus className="w-4 h-4" aria-hidden="true" /> Add variable
          </button>
        </div>

        {draftErrorBanner}
        <NextButton label="Next: Knowledge Base" onClick={() => void goNext('conversation')} busy={drafting.length > 0} />
      </section>
    );
  }

  /* ───────────────────────── KNOWLEDGE ────────────────────────── */

  if (activeModule === 'knowledge') {
    return (
      <section className="space-y-5" aria-labelledby="module-heading">
        <ModuleHeader id="knowledge" />

        <div className="card space-y-4 p-4">
          <div className="flex items-start justify-between gap-4">
            <Toggle id="kbEnabled" label="Enable knowledge base" checked={data.kbEnabled} onChange={(v) => set('kbEnabled', v)} />
            <div className="relative">
              <button
                type="button"
                aria-expanded={kbTipOpen}
                aria-controls="kb-tip"
                onClick={() => setKbTipOpen((o) => !o)}
                onMouseEnter={() => setKbTipOpen(true)}
                className="link inline-flex items-center gap-1.5 text-[12px]"
              >
                <Info className="w-4 h-4" aria-hidden="true" /> What should I add here?
              </button>

              {kbTipOpen && (
                <div
                  id="kb-tip"
                  role="tooltip"
                  onMouseLeave={() => setKbTipOpen(false)}
                  className="absolute right-0 top-full mt-2 z-30 w-[min(92vw,26rem)] rounded-lg border border-white/20 glass-modal p-4 animate-fade-in-up"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className="text-[13px] font-semibold text-ink">Anything factual the agent might be asked</p>
                    <button type="button" aria-label="Close" onClick={() => setKbTipOpen(false)} className="text-faint hover:text-ink">
                      <X className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                  <p className="text-[12px] text-graphite mb-3">
                    The compiler reads this and files each fact into the right part of the prompt — business facts,
                    FAQ answers, policies and objection handling.
                  </p>
                  <ul className="space-y-2">
                    {KB_SOURCE_HINTS.map((h) => (
                      <li key={h.title} className="text-[12px] leading-[1.5]">
                        <span className="font-medium text-ink">{h.title}</span>
                        <span className="text-graphite"> — {h.desc}</span>
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
                <p className="text-[12px] text-faint mb-2">
                  Drop your FAQ docs, pricing sheets, policy files, or past call transcripts.
                  Text is extracted and added to the content box below.
                </p>
                <FileUploadZone
                  files={kbFiles}
                  onFilesChange={setKbFiles}
                  onTextExtracted={handleFileText}
                  onFileRemoved={handleFileRemoved}
                />
              </div>

              <div className="my-2 h-px bg-line" />

              <div>
                <Label htmlFor="kbContent">Knowledge base content</Label>
                <textarea id="kbContent" className="input-field resize-y" rows={14} value={data.kbContent}
                  onChange={(e) => set('kbContent', e.target.value)}
                  placeholder={'Paste your FAQs, pricing sheet, policies, objection notes, troubleshooting steps, hours and locations — raw text is fine, it does not need formatting.'} />
                {data.kbContent.trim() && (
                  <p className="text-[11px] text-faint pt-1 tabular-nums">
                    {data.kbContent.length.toLocaleString()} chars
                  </p>
                )}
                <Guide>
                  Raw and messy is fine. Facts get extracted and routed into the prompt automatically; nothing is
                  pasted in verbatim. Uploaded file text appears here — feel free to edit.
                </Guide>
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-graphite">
              Optional. Without it the agent answers only from the Persona and Conversation sections, and says it does
              not have the detail for anything else — which is safe, just less useful.
            </p>
          )}
        </div>

        <NextButton label="Next: Guardrails & Call Handling" onClick={() => void goNext('knowledge')} busy={drafting.length > 0} />
      </section>
    );
  }

  /* ───────────────── GUARDRAILS & CALL HANDLING ───────────────── */

  return (
    <section className="space-y-6" aria-labelledby="module-heading">
      <ModuleHeader id="rules" />

      {/* Guardrails */}
      <div>
        <Label htmlFor="guardrails" badge={wasDrafted('guardrails') ? <GeneratedBadge /> : undefined}>Guardrails</Label>
        <textarea id="guardrails" className="input-field resize-y" rows={6} value={data.guardrails}
          onChange={(e) => set('guardrails', e.target.value)}
          placeholder={'One rule per line, e.g.\nNever promise a discount without manager approval.\nNever quote an exact price — say "starting from".\nAlways offer a human transfer if asked twice.'} />
        {data.guardrails.trim() && data.guardrails.trim().length < 20
          ? <Hint tone="warn">Add specifics — vague guardrails do not prevent off-script behaviour.</Hint>
          : null}
        <div className="flex items-center justify-between gap-4 pt-1">
          <Guide>One rule per line. These become hard prohibitions in the compiled prompt, not suggestions.</Guide>
          <DraftButton busy={isDrafting('guardrails')} onClick={() => void runAutoFill(['guardrails'], true)}>
            {data.guardrails.trim() ? 'Redraft' : 'Draft from call purpose'}
          </DraftButton>
        </div>
        {draftErrorBanner}
      </div>

      <div className="my-6 h-px bg-line" />

      {/* Compliance */}
      <div>
        <h3 className="text-[14px] font-semibold text-ink mb-4">Disclosure &amp; compliance</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Toggle id="discloseAI" label="Disclose AI identity to the caller" checked={data.discloseAI} onChange={(v) => set('discloseAI', v)} />
          <Toggle id="recordingConsent" label="Recording consent required" checked={data.recordingConsent} onChange={(v) => set('recordingConsent', v)} />
        </div>
        {data.recordingConsent && (
          <div className="mt-4">
            <Label htmlFor="disclosureText">Exact disclosure line</Label>
            <input id="disclosureText" className="input-field" value={data.disclosureText}
              onChange={(e) => set('disclosureText', e.target.value)}
              placeholder="This call may be recorded for quality and training purposes." />
            <Guide>Leave blank and the agent will phrase it itself.</Guide>
          </div>
        )}
      </div>

      <div className="my-6 h-px bg-line" />

      {/* Digression + fallback */}
      <div>
        <h3 className="text-[14px] font-semibold text-ink mb-4">Digression &amp; fallback</h3>

        <div className="space-y-4">
          <div>
            <Label htmlFor="digressionHandling">Mid-flow digression handling</Label>
            <select id="digressionHandling" className="input-field" value={data.digressionHandling} onChange={(e) => set('digressionHandling', e.target.value)}>
              <option>Answer briefly, then resume the script</option>
              <option>Note it and continue the script only</option>
              <option>Refuse and redirect to the script</option>
            </select>
            <Guide>What happens when the caller asks something off-flow mid-conversation.</Guide>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="retryFallback">Retry exhaustion fallback</Label>
              <select id="retryFallback" className="input-field" value={data.retryFallback} onChange={(e) => set('retryFallback', e.target.value)}>
                <option>Transfer to a human agent</option>
                <option>End the call politely</option>
                <option>Offer a callback</option>
                <option>Repeat the request differently</option>
              </select>
            </div>
            <div>
              <Label htmlFor="maxRetries">Max retries before fallback</Label>
              <input id="maxRetries" type="number" min={1} max={5} className="input-field font-mono"
                value={data.maxRetries}
                onChange={(e) => set('maxRetries', Math.min(5, Math.max(1, Number(e.target.value) || 1)))} />
            </div>
          </div>
        </div>
      </div>

      <div className="my-6 h-px bg-line" />

      {/* Live transfer */}
      <div>
        <h3 className="text-[14px] font-semibold text-ink mb-4">Live transfer &amp; escalation</h3>
        <Toggle id="liveTransferEnabled" label="Enable live transfer" checked={data.liveTransferEnabled}
          onChange={(v) => set('liveTransferEnabled', v)} onText="Enabled" offText="Disabled" />

        {data.liveTransferEnabled && (
          <div className="mt-4 space-y-6 rounded-lg border border-line bg-surface p-4">
            <div>
              <span className="block text-[14px] font-medium text-ink mb-3">Transfer numbers</span>
              <div className="space-y-3">
                {data.transferNumbers.map((t, i) => (
                  <div key={i} className="flex gap-2">
                    <input className="input-field flex-1" aria-label={`Transfer label ${i + 1}`} placeholder="Label (e.g. Front desk)"
                      value={t.label} onChange={(e) => updateTransferNumber(i, 'label', e.target.value)} />
                    <input className="input-field flex-1 font-mono text-[13px]" aria-label={`Transfer number ${i + 1}`} placeholder="+1 415 555 0142"
                      value={t.number} onChange={(e) => updateTransferNumber(i, 'number', e.target.value)} />
                    {data.transferNumbers.length > 1 && (
                      <button type="button" aria-label={`Remove transfer number ${i + 1}`} onClick={() => removeTransferNumber(i)}
                        className="p-2 text-faint hover:text-ink transition-colors shrink-0">
                        <X className="w-4 h-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button type="button" onClick={addTransferNumber} className="link mt-3 inline-flex items-center gap-1.5 text-[13px]">
                <Plus className="w-4 h-4" aria-hidden="true" /> Add number
              </button>
            </div>

            <fieldset className="border-0 p-0 m-0">
              <legend className="block text-[14px] font-medium text-ink mb-3">Transfer when…</legend>
              <div className="flex flex-wrap gap-2">
                {TRANSFER_TRIGGERS.map((trigger) => {
                  const active = data.transferTriggers.includes(trigger);
                  return (
                    <button key={trigger} type="button" role="checkbox" aria-checked={active} onClick={() => toggleTrigger(trigger)}
                      className={`px-3 py-1.5 text-[13px] rounded-lg border transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 ${
                        active ? 'border-ink bg-subtle font-medium text-ink' : 'border-line bg-surface text-graphite hover:border-line-strong hover:text-ink'
                      }`}>
                      {trigger}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div>
              <Label htmlFor="afterHoursBehavior">If nobody can take the transfer</Label>
              <textarea id="afterHoursBehavior" className="input-field resize-y" rows={2} value={data.afterHoursBehavior}
                onChange={(e) => set('afterHoursBehavior', e.target.value)}
                placeholder="e.g. Take a message and confirm a callback window" />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
