'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';

/* ---------------------------------------------------------
   STATIC OPTION LISTS
--------------------------------------------------------- */
const GOAL_PRESETS = [
  "Appointment booking",
  "Lead qualification",
  "Customer support",
  "Order tracking / status",
  "Sales & upsell",
  "Survey / feedback collection",
  "Other",
];
const SUB_LANGUAGES = [
  "English", "Hindi", "Tamil", "Telugu", "Marathi", "Bengali", "Gujarati", "Kannada",
];
const getIntakeOptions = (goalPreset: string) => {
  switch (goalPreset) {
    case "Appointment booking":
      return ["Full name", "Date of birth", "Reason for visit", "Preferred date/time", "Insurance / member ID", "New vs. returning"];
    case "Customer support":
      return ["Full name", "Account / Order ID", "Issue category", "Email address", "Phone number"];
    case "Sales & upsell":
    case "Lead qualification":
      return ["Full name", "Company name", "Job title", "Budget", "Timeline", "Current solution"];
    case "Order tracking / status":
      return ["Full name", "Order ID", "Shipping zip code"];
    case "Survey / feedback collection":
      return ["Full name", "Product / Service used", "Date of experience"];
    default:
      return ["Full name", "Date of birth", "Email address", "Phone number", "Account ID"];
  }
};

const getPrecallOptions = (goalPreset: string) => {
  switch (goalPreset) {
    case "Appointment booking":
      return ["Caller name", "Phone number", "Appointment history", "Preferred provider", "None — cold call"];
    case "Customer support":
      return ["Caller name", "Phone number", "Recent tickets", "CRM segment / tag", "Active subscriptions", "None — cold call"];
    case "Sales & upsell":
    case "Lead qualification":
      return ["Lead name", "Company size", "Industry", "Past purchase history", "Lead score", "None — cold call"];
    default:
      return ["Caller name", "Phone number", "CRM segment / tag", "Past purchase history", "None — cold call"];
  }
};
const TRANSFER_CONDITIONS = [
  "Caller explicitly asks for a human",
  "Caller sounds angry or distressed",
  "Issue is outside the agent's scope",
  "Call is after business hours",
];
const TONE_WORDS = [
  "Warm", "Empathetic", "Confident", "Enthusiastic", "Efficient & neutral", "Formal",
];

export const COUNTRY_CODES = [
  { code: '+1', country: 'US/CA', iso: 'US', digits: 10 },
  { code: '+44', country: 'UK', iso: 'GB', digits: 10 },
  { code: '+91', country: 'India', iso: 'IN', digits: 10 },
  { code: '+61', country: 'Australia', iso: 'AU', digits: 9 },
  { code: '+81', country: 'Japan', iso: 'JP', digits: 10 },
  { code: '+49', country: 'Germany', iso: 'DE', digits: 11 },
  { code: '+33', country: 'France', iso: 'FR', digits: 9 },
  { code: '+39', country: 'Italy', iso: 'IT', digits: 10 },
  { code: '+34', country: 'Spain', iso: 'ES', digits: 9 },
  { code: '+55', country: 'Brazil', iso: 'BR', digits: 11 },
  { code: '+52', country: 'Mexico', iso: 'MX', digits: 10 },
  { code: '+27', country: 'South Africa', iso: 'ZA', digits: 9 },
  { code: '+971', country: 'UAE', iso: 'AE', digits: 9 },
  { code: '+966', country: 'Saudi Arabia', iso: 'SA', digits: 9 },
  { code: '+974', country: 'Qatar', iso: 'QA', digits: 8 },
  { code: '+65', country: 'Singapore', iso: 'SG', digits: 8 },
  { code: '+60', country: 'Malaysia', iso: 'MY', digits: 10 },
  { code: '+63', country: 'Philippines', iso: 'PH', digits: 10 },
  { code: '+62', country: 'Indonesia', iso: 'ID', digits: 11 },
  { code: '+64', country: 'New Zealand', iso: 'NZ', digits: 9 },
  { code: '+86', country: 'China', iso: 'CN', digits: 11 },
  { code: '+82', country: 'South Korea', iso: 'KR', digits: 10 },
];

const emptyStaff = { name: "", role: "", availability: "" };
const emptyService = { name: "", desc: "" };
const emptyPolicy = { type: "Cancellation", customType: "", desc: "" };
const emptyTransferNum = { label: "", number: "" };

export const initialData = {
  companyName: "",
  agentName: "",
  callDirection: "Inbound",
  goalPreset: "",
  goalOther: "",
  language: "English",
  subLanguages: [],
  languageMode: "Ask caller preference at start",
  isRemote: false,
  address: "",
  phoneCode: "+1",
  phone: "",
  website: "",

  staffList: [{ ...emptyStaff }],

  services: [{ ...emptyService }],
  intakeReqs: [] as string[],
  intakeModes: {} as Record<string, string>,
  customIntake: [] as string[],
  preCallFields: [] as string[],
  customPreCall: [] as string[],
  faqsText: "", // New single block

  policies: [{ ...emptyPolicy }],
  transferEnabled: false,
  transferNumbers: [{ ...emptyTransferNum }],
  transferConditions: [],
  afterHoursBehavior: "",
  
  voiceGender: "Female",
  toneWords: [],
  aiDisclosure: true,
  recordingConsent: false,
  disclosureText: "",

  openingLine: "",
  closingScript: "",
  callFlowDescription: "",
  interruption: true,
  digression: "Answer briefly, then resume the script",
  retryFallback: "Transfer to a human agent",
  maxRetries: 2,
  needsConfirmation: false,
  confirmationScope: "",
  confirmationStyle: "Summary / paraphrase back",
};

/* ---------------------------------------------------------
   SMALL REUSABLE FIELD COMPONENTS (Pirsch Style)
--------------------------------------------------------- */
function Field({ label, hint, required, children }: any) {
  return (
    <div className="flex flex-col space-y-2 mb-6">
      <label className="text-[16px] font-medium text-ink">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {hint && <div className="text-[14px] text-graphite mb-1">{hint}</div>}
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, mono, type = "text", min, max }: any) {
  return (
    <input
      type={type}
      min={min}
      max={max}
      className={`w-full bg-transparent hairline-border-muted rounded-[6px] px-3 py-2 text-[16px] text-ink placeholder-graphite focus:outline-none focus:hairline-border transition-colors ${mono ? "font-mono" : ""}`}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function TextArea({ value, onChange, placeholder, rows = 3, expandable = false }: any) {
  const [expanded, setExpanded] = React.useState(false);
  const currentRows = expanded ? 15 : rows;
  
  return (
    <div className="relative w-full">
      <textarea
        className="w-full bg-transparent hairline-border-muted rounded-[6px] px-3 py-2 text-[16px] text-ink placeholder-graphite focus:outline-none focus:hairline-border transition-all resize-y"
        value={value}
        rows={currentRows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {expandable && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="absolute bottom-3 right-3 px-3 py-1 bg-white/90 hover:bg-white text-graphite hover:text-ink rounded-buttons shadow-sm border hairline-border transition-colors text-[12px] font-medium backdrop-blur-sm z-10"
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      )}
    </div>
  );
}

function Select({ value, onChange, options }: any) {
  return (
    <select 
      className="w-full bg-transparent hairline-border-muted rounded-[6px] px-3 py-2 text-[16px] text-ink focus:outline-none focus:hairline-border transition-colors appearance-none cursor-pointer"
      value={value} 
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o: string) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

function PhoneInputWithCode({ codeValue, phoneValue, onCodeChange, onPhoneChange }: any) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Sort by digits numerically
  const sortedCodes = [...COUNTRY_CODES].sort((a, b) => 
    parseInt(a.code.replace('+', '')) - parseInt(b.code.replace('+', ''))
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = sortedCodes.filter(c => {
     const s = search.toLowerCase().replace('+', '');
     const codeMatch = c.code.replace('+', '').startsWith(s);
     const nameMatch = c.country.toLowerCase().includes(s);
     return codeMatch || nameMatch;
  });

  const selectedCountry = sortedCodes.find(c => c.code === codeValue) || sortedCodes[0];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered.length > 0) {
        onCodeChange(filtered[0].code);
        setIsOpen(false);
        phoneInputRef.current?.focus();
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className="flex w-full relative">
      <div className="relative w-[140px]" ref={ref}>
        <button 
          type="button"
          className="flex items-center justify-between w-full h-full bg-transparent hairline-border-muted rounded-l-[6px] px-3 py-2 text-[16px] text-ink cursor-pointer border-r-0 border transition-colors hover:bg-black/5"
          onClick={() => {
            setIsOpen(!isOpen);
            setSearch('');
            if (!isOpen) setTimeout(() => searchInputRef.current?.focus(), 10);
          }}
        >
          <span className="font-medium text-[15px]">{selectedCountry.code}</span>
          <span className="text-[10px] text-graphite ml-1">▼</span>
        </button>
        
        {isOpen && (
          <div className="absolute top-full left-0 mt-1 w-[260px] bg-cream-paper border hairline-border-muted rounded-cards shadow-lg z-50 overflow-hidden">
            <div className="p-2 border-b hairline-border-muted">
              <input 
                ref={searchInputRef}
                type="text" 
                placeholder="Search code or country..."
                className="w-full bg-transparent outline-none text-[14px] text-ink placeholder-graphite"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
            <div className="max-h-[220px] overflow-y-auto">
              {filtered.map(c => (
                <div 
                  key={c.code}
                  className="px-3 py-2 text-[14px] hover:bg-sunshine-highlight/50 cursor-pointer flex justify-between items-center transition-colors"
                  onClick={() => { onCodeChange(c.code); setIsOpen(false); phoneInputRef.current?.focus(); }}
                >
                  <span className="font-medium text-ink w-12">{c.code}</span>
                  <span className="text-graphite text-right flex-1 truncate ml-2">{c.country}</span>
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="px-3 py-2 text-[14px] text-graphite text-center">No matches</div>
              )}
            </div>
          </div>
        )}
      </div>
      
      <input
        ref={phoneInputRef}
        type="text"
        maxLength={selectedCountry.digits}
        value={phoneValue}
        onChange={e => onPhoneChange(e.target.value.replace(/\D/g, ''))}
        placeholder={`Phone number (${selectedCountry.digits} digits)`}
        className="flex-1 bg-transparent hairline-border-muted rounded-r-[6px] px-3 py-2 text-[16px] text-ink placeholder-graphite focus:outline-none focus:hairline-border transition-colors font-mono border-l-0"
      />
    </div>
  );
}

function Toggle({ checked, onChange, onLabel = "On", offLabel = "Off" }: any) {
  return (
    <button
      type="button"
      className={`relative inline-flex h-6 w-11 items-center rounded-tags transition-colors ${checked ? "bg-mint-signal" : "bg-graphite"}`}
      onClick={() => onChange(!checked)}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-cream-paper transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
      <span className="sr-only">{checked ? onLabel : offLabel}</span>
    </button>
  );
}

function RadioGroup({ value, onChange, options }: any) {
  return (
    <div className="flex flex-col space-y-2">
      {options.map((opt: string) => (
        <button
          type="button"
          key={opt}
          className={`flex items-center text-left text-[16px] ${value === opt ? "text-ink font-medium" : "text-graphite"} transition-colors`}
          onClick={() => onChange(opt)}
        >
          <span className={`w-4 h-4 rounded-full border mr-3 flex items-center justify-center ${value === opt ? "border-ink" : "border-graphite"}`}>
            {value === opt && <span className="w-2 h-2 bg-ink rounded-full" />}
          </span>
          {opt}
        </button>
      ))}
    </div>
  );
}

function CheckboxChips({ values, onToggle, options, customOptions = [], onDeleteRequest }: any) {
  const allOptions = [...options, ...customOptions];

  const handleDelete = (opt: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onDeleteRequest(opt);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {allOptions.map((opt: string) => {
        const isActive = values.includes(opt);
        const isCustom = customOptions.includes(opt);
        return (
          <div key={opt} className={`flex items-center rounded-tags hairline-border overflow-hidden transition-colors ${isActive ? "bg-ink border-ink text-cream-paper" : "bg-cream-paper border-transparent text-ink hairline-border"}`}>
            <button
              type="button"
              className={`px-4 py-1.5 text-[14px] font-medium transition-colors`}
              onClick={() => onToggle(opt)}
            >
              {opt}
            </button>
            {isCustom && (
              <button
                type="button"
                className={`px-3 py-1.5 text-[18px] font-bold text-red-500 hover:text-red-700 hover:bg-red-500/10 transition-colors border-l ${isActive ? "border-ink/20" : "hairline-border-muted"}`}
                onClick={(e) => handleDelete(opt, e)}
                title="Remove custom option"
              >
                ×
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function IntakeChips({ values, modes, onToggle, onModeChange, options, customOptions = [], onDeleteRequest }: any) {
  const allOptions = [...options, ...customOptions];
  const [openMode, setOpenMode] = React.useState<string | null>(null);

  const handleDelete = (opt: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onDeleteRequest(opt);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {allOptions.map((opt: string) => {
        const isActive = values.includes(opt);
        const isCustom = customOptions.includes(opt);
        const mode = modes[opt] || 'collect';
        const isModeOpen = openMode === opt;
        
        return (
          <div key={opt} className={`flex items-center rounded-tags hairline-border overflow-hidden transition-colors ${isActive ? "bg-cream-paper border-ink" : "bg-cream-paper border-transparent"}`}>
            <button
              type="button"
              className={`px-4 py-1.5 text-[14px] font-medium transition-colors ${isActive ? "bg-ink text-cream-paper" : "bg-cream-paper text-ink hairline-border"}`}
              onClick={() => {
                onToggle(opt);
                if (isActive) setOpenMode(null);
              }}
            >
              {opt}
            </button>
            {isCustom && !isActive && (
              <button
                type="button"
                className="px-3 py-1.5 text-[18px] font-bold text-red-500 hover:text-red-700 hover:bg-red-500/10 transition-colors bg-cream-paper hairline-border border-l-0"
                onClick={(e) => handleDelete(opt, e)}
                title="Remove custom option"
              >
                ×
              </button>
            )}
            {isActive && (
              <div className="flex text-[12px] bg-cream-paper border-l hairline-border-muted items-center">
                {!isModeOpen ? (
                  <button
                    type="button"
                    className="px-3 py-1.5 font-bold text-ink hover:bg-black/5 transition-colors"
                    onClick={() => setOpenMode(opt)}
                  >
                    {mode === 'collect' ? 'Collect' : 'Verify'}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className={`px-3 py-1.5 transition-colors ${mode === 'collect' ? 'font-bold text-ink' : 'text-graphite hover:text-ink'}`}
                      onClick={() => { onModeChange(opt, 'collect'); setOpenMode(null); }}
                    >
                      Collect
                    </button>
                    <div className="w-[1px] bg-border-muted h-full min-h-[28px]" />
                    <button
                      type="button"
                      className={`px-3 py-1.5 transition-colors ${mode === 'verify' ? 'font-bold text-ink' : 'text-graphite hover:text-ink'}`}
                      onClick={() => { onModeChange(opt, 'verify'); setOpenMode(null); }}
                    >
                      Verify
                    </button>
                  </>
                )}
                {isCustom && (
                  <>
                    <div className="w-[1px] bg-border-muted h-full min-h-[28px]" />
                    <button
                      type="button"
                      className="px-3 py-1.5 text-[18px] font-bold text-red-500 hover:text-red-700 hover:bg-red-500/10 transition-colors"
                      onClick={(e) => handleDelete(opt, e)}
                      title="Remove custom option"
                    >
                      ×
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RepeatRow({ children, onRemove, removable = true }: any) {
  return (
    <div className="flex items-start gap-3 mb-3">
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {children}
      </div>
      {removable && (
        <button type="button" className="p-2 text-graphite hover:text-ink transition-colors mt-0.5" onClick={onRemove} aria-label="Remove">
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
}

function AddRowButton({ onClick, label }: any) {
  return (
    <button type="button" className="inline-flex items-center text-[14px] font-medium text-graphite hover:text-ink transition-colors mt-2" onClick={onClick}>
      <Plus size={14} className="mr-1" /> {label}
    </button>
  );
}

/* ---------------------------------------------------------
   MAIN COMPONENT
--------------------------------------------------------- */
interface BuilderFormProps {
  data: typeof initialData;
  setData: React.Dispatch<React.SetStateAction<typeof initialData>>;
  phoneError?: string;
}

const Section = ({ title, children }: any) => (
  <div className="bg-cream-paper rounded-cards hairline-border p-8 mb-8">
    <h2 className="text-[24px] font-medium text-ink mb-6">{title}</h2>
    {children}
  </div>
);

export function BuilderForm({ data, setData, phoneError }: BuilderFormProps) {
  const [newIntake, setNewIntake] = useState("");
  const [newIntakeMode, setNewIntakeMode] = useState("collect");
  const [newPreCall, setNewPreCall] = useState("");
  const [itemToDelete, setItemToDelete] = useState<{ opt: string, type: 'intake' | 'precall' } | null>(null);

  const set = (key: string, val: any) => setData((d) => ({ ...d, [key]: val }));
  const addRow = (key: string, empty: any) => setData((d: any) => ({ ...d, [key]: [...d[key], { ...empty }] }));
  const updateRow = (key: string, idx: number, field: string, val: any) =>
    setData((d: any) => {
      const arr = [...d[key]];
      arr[idx] = { ...arr[idx], [field]: val };
      return { ...d, [key]: arr };
    });
  const removeRow = (key: string, idx: number) =>
    setData((d: any) => ({ ...d, [key]: d[key].filter((_: any, i: number) => i !== idx) }));
  const toggleInArray = (key: string, val: any) =>
    setData((d: any) => {
      const has = d[key].includes(val);
      return { ...d, [key]: has ? d[key].filter((v: any) => v !== val) : [...d[key], val] };
    });

  const handleToggleIntakeReq = (val: string) => {
    setData((d: any) => {
      const isActive = d.intakeReqs.includes(val);
      const newReqs = isActive ? d.intakeReqs.filter((v: any) => v !== val) : [...d.intakeReqs, val];
      const newModes = { ...(d.intakeModes || {}) };
      
      if (isActive) {
        delete newModes[val];
      } else {
        newModes[val] = 'collect';
      }
      
      return {
        ...d,
        intakeReqs: newReqs,
        intakeModes: newModes
      };
    });
  };

  const handleAddCustomIntake = () => {
    if (!newIntake.trim()) return;
    const val = newIntake.trim();
    setData(d => ({
      ...d,
      customIntake: d.customIntake?.includes(val) ? d.customIntake : [...(d.customIntake || []), val],
      intakeReqs: d.intakeReqs?.includes(val) ? d.intakeReqs : [...(d.intakeReqs || []), val],
      intakeModes: { ...(d.intakeModes || {}), [val]: newIntakeMode }
    }));
    setNewIntake("");
    setNewIntakeMode("collect");
  };

  const handleDeleteCustomIntake = (val: string) => {
    setData(d => ({
      ...d,
      customIntake: d.customIntake.filter(v => v !== val),
      intakeReqs: d.intakeReqs.filter(v => v !== val)
    }));
  };

  const handleAddCustomPreCall = () => {
    if (!newPreCall.trim()) return;
    const val = newPreCall.trim();
    setData(d => ({
      ...d,
      customPreCall: d.customPreCall?.includes(val) ? d.customPreCall : [...(d.customPreCall || []), val],
      preCallFields: d.preCallFields?.includes(val) ? d.preCallFields : [...(d.preCallFields || []), val]
    }));
    setNewPreCall("");
  };

  const handleDeleteCustomPreCall = (val: string) => {
    setData(d => ({
      ...d,
      customPreCall: d.customPreCall.filter(v => v !== val),
      preCallFields: d.preCallFields.filter(v => v !== val)
    }));
  };

  const handleDeleteConfirm = () => {
    if (itemToDelete) {
      if (itemToDelete.type === 'intake') {
        handleDeleteCustomIntake(itemToDelete.opt);
      } else {
        handleDeleteCustomPreCall(itemToDelete.opt);
      }
      setItemToDelete(null);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto pb-16">
      <Section title="Identity, Language & Location">
        <Field label="Company / project name" required>
          <TextInput value={data.companyName} onChange={(v: string) => set("companyName", v)} placeholder="e.g. Meridian Dental" />
        </Field>
        <Field label="Agent name" hint="The name the agent will use when making calls.">
          <TextInput value={data.agentName} onChange={(v: string) => set("agentName", v)} placeholder="e.g. Ava" />
        </Field>
        <Field label="Call direction" required hint="Is the agent making outbound calls or receiving inbound calls?">
          <Select value={data.callDirection} onChange={(v: string) => set("callDirection", v)} options={["Inbound", "Outbound"]} />
        </Field>
        <Field label="Primary goal" required hint="What is the main objective of this voice agent?">
          <Select value={data.goalPreset} onChange={(v: string) => set("goalPreset", v)} options={["", ...GOAL_PRESETS]} />
        </Field>
        {data.goalPreset === "Other" && (
          <Field label="Describe the goal">
            <TextInput value={data.goalOther} onChange={(v: string) => set("goalOther", v)} placeholder="What should the agent accomplish on a call?" />
          </Field>
        )}
        <Field label="Primary language & dialect" required>
          <Select value={data.language} onChange={(v: string) => set("language", v)} options={["English", "Hindi", "Hinglish", "Multilingual"]} />
        </Field>
        {data.language === "Multilingual" && (
          <>
            <Field label="Which languages?" hint="Select all that the agent should be able to speak.">
              <CheckboxChips values={data.subLanguages} onToggle={(v: string) => toggleInArray("subLanguages", v)} options={SUB_LANGUAGES} />
            </Field>
            <Field label="How is the language chosen?">
              <RadioGroup
                value={data.languageMode}
                onChange={(v: string) => set("languageMode", v)}
                options={["Ask caller preference at start", "Auto-detect from caller's speech", "Fixed per phone number / campaign"]}
              />
            </Field>
          </>
        )}
        <Field label="Physical location">
          <div className="flex items-center space-x-3">
            <Toggle checked={data.isRemote} onChange={(v: boolean) => set("isRemote", v)} />
            <span className="text-[16px] text-ink">{data.isRemote ? "Remote / no address" : "Has a physical location"}</span>
          </div>
        </Field>
        {!data.isRemote && (
          <Field label="Address">
            <TextArea value={data.address} onChange={(v: string) => set("address", v)} rows={2} placeholder="Street, city, state" />
          </Field>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Field label="Phone">
            <PhoneInputWithCode
              codeValue={data.phoneCode}
              phoneValue={data.phone}
              onCodeChange={(v: string) => set("phoneCode", v)}
              onPhoneChange={(v: string) => set("phone", v)}
            />
            {phoneError && <div className="text-red-500 text-[13px] mt-1.5">{phoneError}</div>}
          </Field>
          <Field label="Website">
            <TextInput mono value={data.website} onChange={(v: string) => set("website", v)} placeholder="www.example.com" />
          </Field>
        </div>
      </Section>

      <Section title="Schedule & Team Setup">
        <Field label="Staff & practitioner roster" hint="Who the agent might mention or book callers with.">
          {data.staffList.map((s, i) => (
            <RepeatRow key={i} onRemove={() => removeRow("staffList", i)} removable={data.staffList.length > 1}>
              <TextInput value={s.name} onChange={(v: string) => updateRow("staffList", i, "name", v)} placeholder="Name" />
              <TextInput value={s.role} onChange={(v: string) => updateRow("staffList", i, "role", v)} placeholder="Role / specialty" />
              <TextInput value={s.availability} onChange={(v: string) => updateRow("staffList", i, "availability", v)} placeholder="Availability (optional)" />
            </RepeatRow>
          ))}
          <AddRowButton onClick={() => addRow("staffList", emptyStaff)} label="Add staff member" />
        </Field>
      </Section>

      <Section title="Services, Intake & Pre-call Variables">
        <Field label="Services offered">
          {data.services.map((s, i) => (
            <RepeatRow key={i} onRemove={() => removeRow("services", i)} removable={data.services.length > 1}>
              <TextInput value={s.name} onChange={(v: string) => updateRow("services", i, "name", v)} placeholder="Service name" />
              <TextInput value={s.desc} onChange={(v: string) => updateRow("services", i, "desc", v)} placeholder="One-line description" />
            </RepeatRow>
          ))}
          <AddRowButton onClick={() => addRow("services", emptyService)} label="Add service" />
        </Field>
        <Field label="Intake & qualification requirements" hint="What must be collected or verified before the agent can help.">
          <IntakeChips 
            values={data.intakeReqs} 
            modes={data.intakeModes}
            customOptions={data.customIntake}
            onToggle={handleToggleIntakeReq} 
            onModeChange={(opt: string, mode: string) => set("intakeModes", { ...data.intakeModes, [opt]: mode })}
            onDeleteRequest={(opt: string) => setItemToDelete({ opt, type: 'intake' })}
            options={getIntakeOptions(data.goalPreset)} 
          />
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1">
              <TextInput value={newIntake} onChange={setNewIntake} placeholder="Add custom requirement" />
            </div>
            <div className="w-[120px]">
              <Select 
                value={newIntakeMode} 
                onChange={setNewIntakeMode}
                options={["collect", "verify"]} 
              />
            </div>
            <button
              type="button"
              className="px-4 py-2 bg-cream-paper hairline-border text-ink rounded-[6px] font-medium hover:bg-ink hover:text-cream-paper transition-colors"
              onClick={handleAddCustomIntake}
            >
              Add
            </button>
          </div>
        </Field>
        <Field label="Pre-call infields" hint="What the system already knows about the caller before the call starts.">
          <CheckboxChips 
            values={data.preCallFields} 
            customOptions={data.customPreCall}
            onToggle={(v: string) => toggleInArray("preCallFields", v)} 
            onDeleteRequest={(opt: string) => setItemToDelete({ opt, type: 'precall' })}
            options={getPrecallOptions(data.goalPreset)} 
          />
          <div className="mt-3 flex items-center gap-2 w-1/2">
            <div className="flex-1">
              <TextInput value={newPreCall} onChange={setNewPreCall} placeholder="Add custom infield" />
            </div>
            <button
              type="button"
              className="px-4 py-2 bg-cream-paper hairline-border text-ink rounded-[6px] font-medium hover:bg-ink hover:text-cream-paper transition-colors"
              onClick={handleAddCustomPreCall}
            >
              Add
            </button>
          </div>
        </Field>
      </Section>

      <Section title="Knowledge Base">
        <Field label="Common caller FAQs" hint="Paste any FAQs, guidelines, or knowledge the agent should use to answer questions.">
          <TextArea value={data.faqsText} onChange={(v: string) => set("faqsText", v)} rows={6} placeholder="e.g. Do you accept walk-ins? Yes, we accept walk-ins on weekdays between 10am and 4pm." expandable={true} />
        </Field>
      </Section>

      <Section title="Policies & Guardrails">
        <Field label="Key business policies">
          {data.policies.map((p, i) => (
            <RepeatRow key={i} onRemove={() => removeRow("policies", i)} removable={data.policies.length > 1}>
              <div className="flex flex-col gap-2">
                <Select value={p.type} onChange={(v: string) => updateRow("policies", i, "type", v)} options={["Cancellation", "Late fee", "Refund", "Rescheduling", "Other"]} />
                {p.type === "Other" && (
                  <TextInput value={p.customType || ""} onChange={(v: string) => updateRow("policies", i, "customType", v)} placeholder="Policy name (e.g. Return Policy)" />
                )}
              </div>
              <div className="md:col-span-2">
                <TextInput value={p.desc} onChange={(v: string) => updateRow("policies", i, "desc", v)} placeholder="Describe the rule" />
              </div>
            </RepeatRow>
          ))}
          <AddRowButton onClick={() => addRow("policies", emptyPolicy)} label="Add policy" />
        </Field>

        <Field label="Live transfer / escalation">
          <div className="flex items-center space-x-3">
            <Toggle checked={data.transferEnabled} onChange={(v: boolean) => set("transferEnabled", v)} />
            <span className="text-[16px] text-ink">{data.transferEnabled ? "Enabled" : "Disabled"}</span>
          </div>
        </Field>
        
        {data.transferEnabled && (
          <div className="ml-4 pl-4 border-l hairline-border-muted space-y-6">
            <Field label="Transfer numbers">
              {data.transferNumbers.map((t, i) => (
                <RepeatRow key={i} onRemove={() => removeRow("transferNumbers", i)} removable={data.transferNumbers.length > 1}>
                  <TextInput value={t.label} onChange={(v: string) => updateRow("transferNumbers", i, "label", v)} placeholder="Label (e.g. Manager)" />
                  <TextInput mono value={t.number} onChange={(v: string) => updateRow("transferNumbers", i, "number", v)} placeholder="Phone number" />
                </RepeatRow>
              ))}
              <AddRowButton onClick={() => addRow("transferNumbers", emptyTransferNum)} label="Add number" />
            </Field>
            <Field label="Transfer when...">
              <CheckboxChips values={data.transferConditions} onToggle={(v: string) => toggleInArray("transferConditions", v)} options={TRANSFER_CONDITIONS} />
            </Field>
            <Field label="After-hours behavior if no one can take the transfer">
              <TextArea value={data.afterHoursBehavior} onChange={(v: string) => set("afterHoursBehavior", v)} rows={2} placeholder="e.g. Take a message and confirm a callback window" />
            </Field>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <Field label="Voice Gender">
            <Select value={data.voiceGender} onChange={(v: string) => set("voiceGender", v)} options={["Female", "Male"]} />
          </Field>
          <Field label="Tone">
            <CheckboxChips values={data.toneWords} onToggle={(v: string) => toggleInArray("toneWords", v)} options={TONE_WORDS} />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Field label="Disclose AI identity to caller">
            <div className="flex items-center space-x-3">
              <Toggle checked={data.aiDisclosure} onChange={(v: boolean) => set("aiDisclosure", v)} />
              <span className="text-[16px] text-ink">{data.aiDisclosure ? "Yes" : "No"}</span>
            </div>
          </Field>
          <Field label="Recording consent required">
            <div className="flex items-center space-x-3">
              <Toggle checked={data.recordingConsent} onChange={(v: boolean) => set("recordingConsent", v)} />
              <span className="text-[16px] text-ink">{data.recordingConsent ? "Yes" : "No"}</span>
            </div>
          </Field>
        </div>
        {data.recordingConsent && (
          <Field label="Exact disclosure line">
            <TextInput value={data.disclosureText} onChange={(v: string) => set("disclosureText", v)} placeholder="This call may be recorded for quality and training purposes." />
          </Field>
        )}
      </Section>

      <Section title="Call Flow Design & Mechanics">
        <Field
          label="Describe the basic call flow"
          hint='Plain language is fine — e.g. "After greeting, callers want to book, reschedule, or ask a question. Handle booking by collecting date and service, then confirm and end. For anything else, answer from FAQs and offer to transfer."'
        >
          <TextArea
            value={data.callFlowDescription}
            onChange={(v: string) => set("callFlowDescription", v)}
            rows={5}
            placeholder="Walk through it like you're briefing a new receptionist..."
          />
        </Field>
        <Field label="Opening line (Optional)" hint="If left blank, the AI will generate a natural opening greeting automatically.">
          <TextArea value={data.openingLine} onChange={(v: string) => set("openingLine", v)} rows={2} placeholder='e.g. "Thanks for calling Meridian Dental, this is Ava — how can I help today?"' />
        </Field>
        <Field label="Closing script (Optional)" hint="If left blank, the AI will generate a natural closing automatically.">
          <TextArea value={data.closingScript} onChange={(v: string) => set("closingScript", v)} rows={2} placeholder='e.g. "Thanks for calling — have a great day!"' />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <Field label="Interruption / barge-in">
            <div className="flex items-center space-x-3">
              <Toggle checked={data.interruption} onChange={(v: boolean) => set("interruption", v)} />
              <span className="text-[16px] text-ink">{data.interruption ? "Allowed" : "Disallowed"}</span>
            </div>
          </Field>
          <Field label="Mid-flow digression handling">
            <Select
              value={data.digression}
              onChange={(v: string) => set("digression", v)}
              options={["Answer briefly, then resume the script", "Note it and continue the script only", "Refuse and redirect to the script"]}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Field label="Retry exhaustion fallback">
            <Select
              value={data.retryFallback}
              onChange={(v: string) => set("retryFallback", v)}
              options={["Transfer to a human agent", "End the call politely", "Offer a callback", "Repeat the request differently"]}
            />
          </Field>
          <Field label="Max retries before fallback">
            <TextInput type="number" min="1" max="5" mono value={data.maxRetries} onChange={(v: string) => set("maxRetries", Number(v))} />
          </Field>
        </div>
        <Field label="Confirmation & Read-back" hint="Does the agent need to explicitly confirm collected information before proceeding?">
          <div className="flex items-center space-x-3 mb-2">
            <Toggle checked={data.needsConfirmation} onChange={(v: boolean) => set("needsConfirmation", v)} />
            <span className="text-[16px] text-ink">{data.needsConfirmation ? "Yes, confirmation is required" : "No confirmation required"}</span>
          </div>
          
          {data.needsConfirmation && (
            <div className="mt-4 p-5 border hairline-border-muted rounded-cards space-y-6">
              <Field label="What needs to be confirmed?" required hint="e.g. 'Email, phone number, and appointment time' or 'Order ID'">
                <TextInput value={data.confirmationScope} onChange={(v: string) => set("confirmationScope", v)} placeholder="List the critical fields to read back..." />
              </Field>
              <div className="-mb-6">
                <Field label="How should it be confirmed?" required>
                  <RadioGroup
                    value={data.confirmationStyle}
                    onChange={(v: string) => set("confirmationStyle", v)}
                    options={["Character-by-character spelling", "Summary / paraphrase back", "Hybrid — spell critical data, summarize the rest"]}
                  />
                </Field>
              </div>
            </div>
          )}
        </Field>
      </Section>

      {itemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-cream-paper rounded-[12px] max-w-sm w-full p-6 shadow-xl border border-border">
            <h3 className="text-xl font-bold text-ink mb-2">Delete custom field?</h3>
            <p className="text-graphite mb-6">
              Are you sure you want to delete "{itemToDelete.opt}"? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="px-4 py-2 font-medium text-ink hover:bg-black/5 rounded-[6px] transition-colors"
                onClick={() => setItemToDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 font-medium bg-red-500 text-white hover:bg-red-600 rounded-[6px] transition-colors"
                onClick={handleDeleteConfirm}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
