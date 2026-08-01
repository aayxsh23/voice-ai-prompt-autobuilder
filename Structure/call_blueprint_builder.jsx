import React, { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Copy,
  Check,
  Pencil,
} from "lucide-react";

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
  "English",
  "Hindi",
  "Tamil",
  "Telugu",
  "Marathi",
  "Bengali",
  "Gujarati",
  "Kannada",
];
const INTAKE_OPTIONS = [
  "Full name",
  "Date of birth",
  "Insurance / member ID",
  "Referral source",
  "New vs. returning",
  "Preferred payment method",
];
const PRECALL_OPTIONS = [
  "Caller name",
  "Phone number",
  "CRM segment / tag",
  "Appointment history",
  "Past purchase history",
  "None — cold call",
];
const TRANSFER_CONDITIONS = [
  "Caller explicitly asks for a human",
  "Caller sounds angry or distressed",
  "Issue is outside the agent's scope",
  "Call is after business hours",
];
const EDGE_CASES = [
  "Confused caller",
  "Angry or upset caller",
  "Repeated invalid answers",
  "Off-topic tangents",
  "Explicit request for a human",
];
const TONE_WORDS = [
  "Warm",
  "Empathetic",
  "Confident",
  "Enthusiastic",
  "Efficient & neutral",
  "Formal",
];
const STEP_LABELS = [
  "Identity",
  "Team",
  "Services",
  "Policies",
  "Call flow",
  "Review",
  "Verify",
  "Prompt",
];

const emptyStaff = { name: "", role: "", availability: "" };
const emptyService = { name: "", desc: "" };
const emptyFaq = { q: "", a: "" };
const emptyPolicy = { type: "Cancellation", desc: "" };
const emptyTransferNum = { label: "", number: "" };

const initialData = {
  companyName: "",
  goalPreset: "",
  goalOther: "",
  language: "English",
  subLanguages: [],
  languageMode: "Ask caller preference at start",
  isRemote: false,
  address: "",
  phone: "",
  website: "",

  staffList: [{ ...emptyStaff }],
  allowStaffSelection: false,
  staffUnavailableAction: "Offer an alternative",

  services: [{ ...emptyService }],
  intakeReqs: [],
  intakeOther: "",
  preCallFields: [],
  faqs: [{ ...emptyFaq }],

  policies: [{ ...emptyPolicy }],
  transferEnabled: false,
  transferNumbers: [{ ...emptyTransferNum }],
  transferConditions: [],
  afterHoursBehavior: "",
  edgeCaseSelections: [],
  edgeCaseNotes: "",
  pacing: "Natural / conversational",
  formality: "Professional",
  toneWords: [],
  accentNote: "",
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
  confirmationStyle: "Summary / paraphrase back",
};

/* ---------------------------------------------------------
   SMALL REUSABLE FIELD COMPONENTS
--------------------------------------------------------- */
function Field({ label, hint, required, children }) {
  return (
    <div className="cb-field">
      <label className="cb-label">
        {label}
        {required && <span className="cb-req">*</span>}
      </label>
      {hint && <div className="cb-hint">{hint}</div>}
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, mono }) {
  return (
    <input
      className={"cb-input" + (mono ? " cb-mono" : "")}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function TextArea({ value, onChange, placeholder, rows = 3 }) {
  return (
    <textarea
      className="cb-textarea"
      value={value}
      rows={rows}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function Select({ value, onChange, options }) {
  return (
    <select className="cb-select" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function Toggle({ checked, onChange, onLabel = "On", offLabel = "Off" }) {
  return (
    <button
      type="button"
      className={"cb-toggle" + (checked ? " cb-toggle-on" : "")}
      onClick={() => onChange(!checked)}
    >
      <span className="cb-toggle-track">
        <span className="cb-toggle-thumb" />
      </span>
      <span className="cb-toggle-text">{checked ? onLabel : offLabel}</span>
    </button>
  );
}

function RadioGroup({ value, onChange, options }) {
  return (
    <div className="cb-radio-group">
      {options.map((opt) => (
        <button
          type="button"
          key={opt}
          className={"cb-radio-option" + (value === opt ? " cb-radio-active" : "")}
          onClick={() => onChange(opt)}
        >
          <span className="cb-radio-dot" />
          {opt}
        </button>
      ))}
    </div>
  );
}

function CheckboxChips({ values, onToggle, options }) {
  return (
    <div className="cb-chip-group">
      {options.map((opt) => (
        <button
          type="button"
          key={opt}
          className={"cb-chip" + (values.includes(opt) ? " cb-chip-active" : "")}
          onClick={() => onToggle(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function RepeatRow({ children, onRemove, removable = true }) {
  return (
    <div className="cb-repeat-row">
      <div className="cb-repeat-fields">{children}</div>
      {removable && (
        <button type="button" className="cb-icon-btn" onClick={onRemove} aria-label="Remove">
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

function AddRowButton({ onClick, label }) {
  return (
    <button type="button" className="cb-add-row" onClick={onClick}>
      <Plus size={14} /> {label}
    </button>
  );
}

/* ---------------------------------------------------------
   PROMPT TEMPLATE GENERATOR
--------------------------------------------------------- */
function buildPrompt(d, extraQA = []) {
  const goal = d.goalPreset === "Other" ? d.goalOther : d.goalPreset;
  const lang =
    d.language === "Multilingual"
      ? `Multilingual (${d.subLanguages.join(", ") || "languages not specified"}) — ${d.languageMode.toLowerCase()}`
      : d.language;

  const staffLines = d.staffList
    .filter((s) => s.name)
    .map((s) => `- ${s.name}${s.role ? ` — ${s.role}` : ""}${s.availability ? ` (${s.availability})` : ""}`)
    .join("\n") || "- (none specified)";

  const serviceLines = d.services
    .filter((s) => s.name)
    .map((s) => `- ${s.name}${s.desc ? `: ${s.desc}` : ""}`)
    .join("\n") || "- (none specified)";

  const intakeLines = [...d.intakeReqs, d.intakeOther].filter(Boolean).join(", ") || "None specified";
  const precallLines = d.preCallFields.join(", ") || "None — treat every caller as unknown";

  const faqLines = d.faqs
    .filter((f) => f.q)
    .map((f) => `Q: ${f.q}\nA: ${f.a}`)
    .join("\n\n") || "(none specified)";

  const policyLines = d.policies
    .filter((p) => p.desc)
    .map((p) => `- ${p.type}: ${p.desc}`)
    .join("\n") || "- (none specified)";

  const transferBlock = d.transferEnabled
    ? `Live transfer is ENABLED.\nTransfer numbers:\n${
        d.transferNumbers
          .filter((t) => t.number)
          .map((t) => `- ${t.label || "General"}: ${t.number}`)
          .join("\n") || "- (none specified)"
      }\nTransfer when: ${d.transferConditions.join(", ") || "not specified"}.\nAfter-hours behavior: ${
        d.afterHoursBehavior || "not specified"
      }`
    : "Live transfer is DISABLED. Never offer to connect the caller to a human; handle every request within the script or end the call politely.";

  const edgeLines =
    d.edgeCaseSelections.length > 0
      ? `Be ready to handle: ${d.edgeCaseSelections.join(", ")}.\nGeneral guidance: ${
          d.edgeCaseNotes || "stay calm, acknowledge the caller, and gently steer back to the task."
        }`
      : "No special edge cases specified.";

  const callFlowLines =
    d.callFlowDescription.trim() ||
    "(not specified — default to a single linear flow: greet, handle the caller's request, confirm details, close.)";

  const clarificationLines =
    extraQA.length > 0
      ? extraQA.map((qa) => `- Q: ${qa.question}\n  A: ${qa.answer}`).join("\n")
      : "(none — no open questions were flagged, or none were answered)";

  const disclosureLines = [
    d.aiDisclosure ? "Disclose at the start of the call that the caller is speaking with an AI agent." : "Do not proactively disclose AI identity unless directly asked.",
    d.recordingConsent ? `Recording consent is required. Use this line: "${d.disclosureText || "This call may be recorded for quality and training purposes."}"` : "No recording-consent disclosure required.",
  ].join("\n");

  return `# VOICE AGENT SYSTEM PROMPT — ${d.companyName || "[Company Name]"}

## 1. Identity & Objective
You are the voice AI agent for ${d.companyName || "[Company Name]"}.
Primary objective: ${goal || "[not specified]"}.
Primary language: ${lang}.

## 2. Location & Contact
${d.isRemote ? "This is a remote/location-less business — do not reference a physical address." : `Address: ${d.address || "[not specified]"}`}
Phone: ${d.phone || "[not specified]"}
Website: ${d.website || "[not specified]"}

## 3. Team & Scheduling
${staffLines}
Caller may request a specific staff member: ${d.allowStaffSelection ? "Yes" : "No"}.
${d.allowStaffSelection ? `If requested staff is unavailable: ${d.staffUnavailableAction}.` : ""}

## 4. Services Offered
${serviceLines}

## 5. Intake & Pre-Call Context
Information to collect/verify from every caller: ${intakeLines}.
Information already known before the call begins: ${precallLines}.

## 6. Frequently Asked Questions
${faqLines}

## 7. Policies
${policyLines}

## 8. Escalation & Transfer
${transferBlock}

## 9. Edge Cases & Objection Handling
${edgeLines}

## 10. Voice & Persona
Pacing: ${d.pacing}. Formality: ${d.formality}. Tone: ${d.toneWords.join(", ") || "not specified"}.
${d.accentNote ? `Additional note: ${d.accentNote}` : ""}

## 11. Consent & Compliance
${disclosureLines}

## 12. Opening & Closing
Opening line (say verbatim): "${d.openingLine || "[not specified]"}"
Closing line (say verbatim): "${d.closingScript || "[not specified]"}"

## 13. Call Flow
${callFlowLines}

Derive the specific routing branches, states, and transitions needed to support this flow yourself; use good judgment for any edge case not explicitly covered above.

## 14. Conversational Mechanics
- Barge-in / interruption: ${d.interruption ? "ALLOWED — stop speaking immediately if the caller talks over you." : "NOT ALLOWED — finish the current line before processing new input."}
- Mid-flow digression: ${d.digression}.
- Retry exhaustion (after ${d.maxRetries} failed attempts): ${d.retryFallback}.
- Confirmation / read-back style: ${d.confirmationStyle}.

## 15. Clarifications
${clarificationLines}
`;
}

/* ---------------------------------------------------------
   LLM VERIFICATION STEP
   Sends the submitted form to Claude, which flags anything
   missing, ambiguous, or worth double-checking before the
   final prompt is generated.
--------------------------------------------------------- */
async function fetchVerificationQuestions(data) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: `You are reviewing a completed intake form for a voice AI agent before its system prompt is generated. Here is everything the business owner entered, as JSON:

${JSON.stringify(data, null, 2)}

Find up to 5 specific things that are missing, vague, contradictory, or risky to leave unclarified (for example: a described call flow that doesn't match the services listed, a policy with no detail, a transfer that's enabled with no number, or a goal that's too vague to script an opening line for). Skip anything that is already clear enough to work with.

Write each as one short, plain-language question a non-technical business owner could answer directly in a couple of sentences.

Respond with ONLY a JSON array, no markdown fences, no preamble, no explanation — exactly this shape:
[{"id": "q1", "question": "..."}]

If nothing needs clarifying, respond with exactly: []`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error("Request failed with status " + response.status);
  }

  const json = await response.json();
  const textBlock = (json.content || []).find((b) => b.type === "text");
  const raw = textBlock ? textBlock.text : "[]";
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error("Unexpected response shape");
  return parsed;
}

/* ---------------------------------------------------------
   MAIN COMPONENT
--------------------------------------------------------- */
export default function CallBlueprintBuilder() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState(initialData);
  const [copied, setCopied] = useState(false);
  const [verifyQuestions, setVerifyQuestions] = useState([]);
  const [verifyAnswers, setVerifyAnswers] = useState({});
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState("");

  const set = (key, val) => setData((d) => ({ ...d, [key]: val }));
  const addRow = (key, empty) => setData((d) => ({ ...d, [key]: [...d[key], { ...empty }] }));
  const updateRow = (key, idx, field, val) =>
    setData((d) => {
      const arr = [...d[key]];
      arr[idx] = { ...arr[idx], [field]: val };
      return { ...d, [key]: arr };
    });
  const removeRow = (key, idx) =>
    setData((d) => ({ ...d, [key]: d[key].filter((_, i) => i !== idx) }));
  const toggleInArray = (key, val) =>
    setData((d) => {
      const has = d[key].includes(val);
      return { ...d, [key]: has ? d[key].filter((v) => v !== val) : [...d[key], val] };
    });

  const goNext = () => setStep((s) => Math.min(7, s + 1));
  const goBack = () => setStep((s) => Math.max(0, s - 1));
  const jumpTo = (i) => setStep(i);

  const setVerifyAnswer = (id, val) => setVerifyAnswers((a) => ({ ...a, [id]: val }));

  const answeredQA = verifyQuestions
    .filter((q) => (verifyAnswers[q.id] || "").trim())
    .map((q) => ({ question: q.question, answer: verifyAnswers[q.id].trim() }));

  const handleSubmitForReview = async () => {
    setVerifyLoading(true);
    setVerifyError("");
    try {
      const questions = await fetchVerificationQuestions(data);
      setVerifyQuestions(questions);
    } catch (e) {
      setVerifyError("Couldn't run the automatic review right now — you can still continue.");
      setVerifyQuestions([]);
    } finally {
      setVerifyLoading(false);
      setStep(6);
    }
  };

  const copyPrompt = async () => {
    const text = buildPrompt(data, answeredQA);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      setCopied(false);
    }
  };

  /* ---------------- STEP CONTENT ---------------- */
  function renderStep() {
    switch (step) {
      case 0:
        return (
          <>
            <StepHeader title="Identity, language & location" desc="The basics — who this agent represents and how it should sound at a top level." />
            <Field label="Company name" required>
              <TextInput value={data.companyName} onChange={(v) => set("companyName", v)} placeholder="e.g. Meridian Dental Care" />
            </Field>
            <Field label="Primary agent goal" required hint="Pick the closest match — this shapes the whole prompt structure.">
              <Select value={data.goalPreset} onChange={(v) => set("goalPreset", v)} options={["", ...GOAL_PRESETS]} />
            </Field>
            {data.goalPreset === "Other" && (
              <Field label="Describe the goal">
                <TextInput value={data.goalOther} onChange={(v) => set("goalOther", v)} placeholder="What should the agent accomplish on a call?" />
              </Field>
            )}
            <Field label="Primary language & dialect" required>
              <Select value={data.language} onChange={(v) => set("language", v)} options={["English", "Hindi", "Hinglish", "Multilingual"]} />
            </Field>
            {data.language === "Multilingual" && (
              <>
                <Field label="Which languages?" hint="Select all that the agent should be able to speak.">
                  <CheckboxChips values={data.subLanguages} onToggle={(v) => toggleInArray("subLanguages", v)} options={SUB_LANGUAGES} />
                </Field>
                <Field label="How is the language chosen?">
                  <RadioGroup
                    value={data.languageMode}
                    onChange={(v) => set("languageMode", v)}
                    options={["Ask caller preference at start", "Auto-detect from caller's speech", "Fixed per phone number / campaign"]}
                  />
                </Field>
              </>
            )}
            <Field label="Physical location">
              <Toggle checked={data.isRemote} onChange={(v) => set("isRemote", v)} onLabel="Remote / no address" offLabel="Has a physical location" />
            </Field>
            {!data.isRemote && (
              <Field label="Address">
                <TextArea value={data.address} onChange={(v) => set("address", v)} rows={2} placeholder="Street, city, state" />
              </Field>
            )}
            <div className="cb-row-2">
              <Field label="Phone">
                <TextInput mono value={data.phone} onChange={(v) => set("phone", v)} placeholder="+91 98xxxxxxx" />
              </Field>
              <Field label="Website">
                <TextInput mono value={data.website} onChange={(v) => set("website", v)} placeholder="www.example.com" />
              </Field>
            </div>
          </>
        );

      case 1:
        return (
          <>
            <StepHeader title="Schedule & team setup" desc="Who the agent might mention or book callers with." />
            <Field label="Staff & practitioner roster">
              {data.staffList.map((s, i) => (
                <RepeatRow key={i} onRemove={() => removeRow("staffList", i)} removable={data.staffList.length > 1}>
                  <TextInput value={s.name} onChange={(v) => updateRow("staffList", i, "name", v)} placeholder="Name" />
                  <TextInput value={s.role} onChange={(v) => updateRow("staffList", i, "role", v)} placeholder="Role / specialty" />
                  <TextInput value={s.availability} onChange={(v) => updateRow("staffList", i, "availability", v)} placeholder="Availability (optional)" />
                </RepeatRow>
              ))}
              <AddRowButton onClick={() => addRow("staffList", emptyStaff)} label="Add staff member" />
            </Field>
            <Field label="Can callers request a specific staff member?">
              <Toggle checked={data.allowStaffSelection} onChange={(v) => set("allowStaffSelection", v)} />
            </Field>
            {data.allowStaffSelection && (
              <Field label="If that staff member is unavailable...">
                <Select
                  value={data.staffUnavailableAction}
                  onChange={(v) => set("staffUnavailableAction", v)}
                  options={["Offer an alternative", "Add to waitlist", "Transfer to a human to sort out", "Ask caller to call back"]}
                />
              </Field>
            )}
          </>
        );

      case 2:
        return (
          <>
            <StepHeader title="Services, intake & pre-call variables" desc="What you offer, what you need from callers, and what the system already knows." />
            <Field label="Services offered">
              {data.services.map((s, i) => (
                <RepeatRow key={i} onRemove={() => removeRow("services", i)} removable={data.services.length > 1}>
                  <TextInput value={s.name} onChange={(v) => updateRow("services", i, "name", v)} placeholder="Service name" />
                  <TextInput value={s.desc} onChange={(v) => updateRow("services", i, "desc", v)} placeholder="One-line description" />
                </RepeatRow>
              ))}
              <AddRowButton onClick={() => addRow("services", emptyService)} label="Add service" />
            </Field>
            <Field label="Intake & qualification requirements" hint="What must be collected or verified before the agent can help.">
              <CheckboxChips values={data.intakeReqs} onToggle={(v) => toggleInArray("intakeReqs", v)} options={INTAKE_OPTIONS} />
              <TextInput value={data.intakeOther} onChange={(v) => set("intakeOther", v)} placeholder="Other requirement (optional)" />
            </Field>
            <Field label="Pre-call infields" hint="What the system already knows about the caller before the call starts.">
              <CheckboxChips values={data.preCallFields} onToggle={(v) => toggleInArray("preCallFields", v)} options={PRECALL_OPTIONS} />
            </Field>
            <Field label="Common caller FAQs">
              {data.faqs.map((f, i) => (
                <RepeatRow key={i} onRemove={() => removeRow("faqs", i)} removable={data.faqs.length > 1}>
                  <TextInput value={f.q} onChange={(v) => updateRow("faqs", i, "q", v)} placeholder="Question callers ask" />
                  <TextArea value={f.a} onChange={(v) => updateRow("faqs", i, "a", v)} rows={2} placeholder="Answer the agent should give" />
                </RepeatRow>
              ))}
              <AddRowButton onClick={() => addRow("faqs", emptyFaq)} label="Add FAQ" />
            </Field>
          </>
        );

      case 3:
        return (
          <>
            <StepHeader title="Policies, edge cases & guardrails" desc="Rules the agent must never break, and how it handles the unexpected." />
            <Field label="Key business policies">
              {data.policies.map((p, i) => (
                <RepeatRow key={i} onRemove={() => removeRow("policies", i)} removable={data.policies.length > 1}>
                  <Select value={p.type} onChange={(v) => updateRow("policies", i, "type", v)} options={["Cancellation", "Late fee", "Refund", "Rescheduling", "Other"]} />
                  <TextInput value={p.desc} onChange={(v) => updateRow("policies", i, "desc", v)} placeholder="Describe the rule" />
                </RepeatRow>
              ))}
              <AddRowButton onClick={() => addRow("policies", emptyPolicy)} label="Add policy" />
            </Field>

            <Field label="Live transfer / escalation">
              <Toggle checked={data.transferEnabled} onChange={(v) => set("transferEnabled", v)} onLabel="Enabled" offLabel="Disabled" />
            </Field>
            {data.transferEnabled && (
              <>
                <Field label="Transfer numbers">
                  {data.transferNumbers.map((t, i) => (
                    <RepeatRow key={i} onRemove={() => removeRow("transferNumbers", i)} removable={data.transferNumbers.length > 1}>
                      <TextInput value={t.label} onChange={(v) => updateRow("transferNumbers", i, "label", v)} placeholder="Label (e.g. Manager)" />
                      <TextInput mono value={t.number} onChange={(v) => updateRow("transferNumbers", i, "number", v)} placeholder="Phone number" />
                    </RepeatRow>
                  ))}
                  <AddRowButton onClick={() => addRow("transferNumbers", emptyTransferNum)} label="Add number" />
                </Field>
                <Field label="Transfer when...">
                  <CheckboxChips values={data.transferConditions} onToggle={(v) => toggleInArray("transferConditions", v)} options={TRANSFER_CONDITIONS} />
                </Field>
                <Field label="After-hours behavior if no one can take the transfer">
                  <TextArea value={data.afterHoursBehavior} onChange={(v) => set("afterHoursBehavior", v)} rows={2} placeholder="e.g. Take a message and confirm a callback window" />
                </Field>
              </>
            )}

            <Field label="Edge cases to prepare for">
              <CheckboxChips values={data.edgeCaseSelections} onToggle={(v) => toggleInArray("edgeCaseSelections", v)} options={EDGE_CASES} />
              <TextArea value={data.edgeCaseNotes} onChange={(v) => set("edgeCaseNotes", v)} rows={2} placeholder="General guidance for handling these (optional)" />
            </Field>

            <div className="cb-row-2">
              <Field label="Pacing">
                <Select value={data.pacing} onChange={(v) => set("pacing", v)} options={["Slow / measured", "Natural / conversational", "Brisk / efficient"]} />
              </Field>
              <Field label="Formality">
                <Select value={data.formality} onChange={(v) => set("formality", v)} options={["Casual", "Professional", "Formal"]} />
              </Field>
            </div>
            <Field label="Tone">
              <CheckboxChips values={data.toneWords} onToggle={(v) => toggleInArray("toneWords", v)} options={TONE_WORDS} />
            </Field>
            <Field label="Accent / voice notes (optional)">
              <TextInput value={data.accentNote} onChange={(v) => set("accentNote", v)} placeholder="e.g. Neutral Indian-English accent" />
            </Field>

            <div className="cb-row-2">
              <Field label="Disclose AI identity to caller">
                <Toggle checked={data.aiDisclosure} onChange={(v) => set("aiDisclosure", v)} />
              </Field>
              <Field label="Recording consent required">
                <Toggle checked={data.recordingConsent} onChange={(v) => set("recordingConsent", v)} />
              </Field>
            </div>
            {data.recordingConsent && (
              <Field label="Exact disclosure line">
                <TextInput value={data.disclosureText} onChange={(v) => set("disclosureText", v)} placeholder="This call may be recorded for quality and training purposes." />
              </Field>
            )}
          </>
        );

      case 4:
        return (
          <>
            <StepHeader title="Call flow design & conversational mechanics" desc="The exact words and the logic that connect them." />
            <Field label="Opening line" required>
              <TextArea value={data.openingLine} onChange={(v) => set("openingLine", v)} rows={2} placeholder='e.g. "Thanks for calling Meridian Dental, this is Ava — how can I help today?"' />
            </Field>
            <Field label="Closing script" required>
              <TextArea value={data.closingScript} onChange={(v) => set("closingScript", v)} rows={2} placeholder='e.g. "Thanks for calling — have a great day!"' />
            </Field>
            <Field
              label="Describe the basic call flow"
              hint='Plain language is fine — e.g. "After the greeting, most callers either want to book, reschedule, or ask a question. Handle booking by collecting date and service, then confirm and end. For anything else, answer from the FAQs and offer to transfer if needed." The agent works out the exact branching and edge cases from this.'
            >
              <TextArea
                value={data.callFlowDescription}
                onChange={(v) => set("callFlowDescription", v)}
                rows={5}
                placeholder="Walk through it like you're briefing a new receptionist — what happens first, what the caller usually wants, and how the call should wrap up."
              />
            </Field>
            <Field label="Interruption / barge-in">
              <Toggle checked={data.interruption} onChange={(v) => set("interruption", v)} onLabel="Allowed" offLabel="Disallowed" />
            </Field>
            <Field label="Mid-flow digression handling">
              <RadioGroup
                value={data.digression}
                onChange={(v) => set("digression", v)}
                options={["Answer briefly, then resume the script", "Note it and continue the script only", "Refuse and redirect to the script"]}
              />
            </Field>
            <div className="cb-row-2">
              <Field label="Retry exhaustion fallback">
                <Select
                  value={data.retryFallback}
                  onChange={(v) => set("retryFallback", v)}
                  options={["Transfer to a human agent", "End the call politely", "Offer a callback", "Repeat the request differently"]}
                />
              </Field>
              <Field label="Max retries before fallback">
                <input
                  type="number"
                  min={1}
                  max={5}
                  className="cb-input cb-mono"
                  value={data.maxRetries}
                  onChange={(e) => set("maxRetries", Number(e.target.value))}
                />
              </Field>
            </div>
            <Field label="Confirmation / read-back style">
              <RadioGroup
                value={data.confirmationStyle}
                onChange={(v) => set("confirmationStyle", v)}
                options={["Character-by-character spelling", "Summary / paraphrase back", "Hybrid — spell critical data, summarize the rest"]}
              />
            </Field>
          </>
        );

      case 5:
        return <ReviewScreen data={data} jumpTo={jumpTo} />;

      case 6:
        return (
          <VerifyScreen
            loading={verifyLoading}
            error={verifyError}
            questions={verifyQuestions}
            answers={verifyAnswers}
            onAnswerChange={setVerifyAnswer}
          />
        );

      case 7:
        return (
          <>
            <StepHeader title="Generated prompt" desc="Assembled from every answer — including your clarifications. Copy it into your agent builder, or go back to adjust anything." />
            <div className="cb-output-wrap">
              <button type="button" className="cb-copy-btn" onClick={copyPrompt}>
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy prompt"}
              </button>
              <pre className="cb-output-panel">{buildPrompt(data, answeredQA)}</pre>
            </div>
          </>
        );

      default:
        return null;
    }
  }

  const isReview = step === 5;
  const isVerify = step === 6;
  const isOutput = step === 7;

  return (
    <div className="cb-app">
      <style>{CSS}</style>

      <div className="cb-shell">
        <aside className="cb-rail">
          <div className="cb-brand">
            <span className="cb-brand-dot" />
            Call Blueprint
          </div>
          <div className="cb-rail-nodes">
            {STEP_LABELS.map((label, i) => (
              <button
                type="button"
                key={label}
                className={
                  "cb-rail-node" +
                  (i === step ? " cb-rail-node-active" : "") +
                  (i < step ? " cb-rail-node-done" : "")
                }
                onClick={() => jumpTo(i)}
              >
                <span className="cb-rail-bar" />
                <span className="cb-rail-label">{label}</span>
              </button>
            ))}
          </div>
        </aside>

        <main className="cb-main">
          <div className="cb-card">{renderStep()}</div>

          <div className="cb-nav">
            <button type="button" className="cb-btn cb-btn-ghost" onClick={goBack} disabled={step === 0}>
              <ChevronLeft size={16} /> Back
            </button>
            {!isOutput ? (
              <button
                type="button"
                className="cb-btn cb-btn-primary"
                onClick={isReview ? handleSubmitForReview : goNext}
                disabled={isReview && verifyLoading}
              >
                {isReview ? (verifyLoading ? "Reviewing your answers…" : "Submit for review") : isVerify ? "Generate prompt" : "Save & continue"}{" "}
                <ChevronRight size={16} />
              </button>
            ) : (
              <button type="button" className="cb-btn cb-btn-primary" onClick={() => jumpTo(0)}>
                Start a new blueprint
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function StepHeader({ title, desc }) {
  return (
    <div className="cb-step-header">
      <h2 className="cb-step-title">{title}</h2>
      <p className="cb-step-desc">{desc}</p>
    </div>
  );
}

function ReviewScreen({ data, jumpTo }) {
  const Row = ({ label, value }) =>
    value ? (
      <div className="cb-review-row">
        <span className="cb-review-key">{label}</span>
        <span className="cb-review-val">{value}</span>
      </div>
    ) : null;

  const Section = ({ index, title, children }) => (
    <div className="cb-review-section">
      <div className="cb-review-section-head">
        <h3>{title}</h3>
        <button type="button" className="cb-edit-link" onClick={() => jumpTo(index)}>
          <Pencil size={12} /> Edit
        </button>
      </div>
      {children}
    </div>
  );

  return (
    <>
      <StepHeader title="Review everything" desc="Check each section before generating the final prompt. Edit jumps straight back to that step." />
      <Section index={0} title="Identity, language & location">
        <Row label="Company" value={data.companyName} />
        <Row label="Goal" value={data.goalPreset === "Other" ? data.goalOther : data.goalPreset} />
        <Row label="Language" value={data.language === "Multilingual" ? `Multilingual (${data.subLanguages.join(", ")})` : data.language} />
        <Row label="Location" value={data.isRemote ? "Remote / no address" : data.address} />
        <Row label="Phone" value={data.phone} />
        <Row label="Website" value={data.website} />
      </Section>
      <Section index={1} title="Team">
        <Row label="Staff" value={data.staffList.filter((s) => s.name).map((s) => s.name).join(", ")} />
        <Row label="Staff selection allowed" value={data.allowStaffSelection ? "Yes" : "No"} />
      </Section>
      <Section index={2} title="Services & intake">
        <Row label="Services" value={data.services.filter((s) => s.name).map((s) => s.name).join(", ")} />
        <Row label="Intake requirements" value={data.intakeReqs.join(", ")} />
        <Row label="Pre-call known info" value={data.preCallFields.join(", ")} />
        <Row label="FAQs captured" value={String(data.faqs.filter((f) => f.q).length)} />
      </Section>
      <Section index={3} title="Policies & guardrails">
        <Row label="Policies" value={data.policies.filter((p) => p.desc).map((p) => p.type).join(", ")} />
        <Row label="Live transfer" value={data.transferEnabled ? "Enabled" : "Disabled"} />
        <Row label="Tone" value={data.toneWords.join(", ")} />
        <Row label="AI disclosure" value={data.aiDisclosure ? "Yes" : "No"} />
      </Section>
      <Section index={4} title="Call flow">
        <Row label="Opening" value={data.openingLine} />
        <Row label="Closing" value={data.closingScript} />
        <Row label="Call flow" value={data.callFlowDescription} />
        <Row label="Interruption" value={data.interruption ? "Allowed" : "Disallowed"} />
        <Row label="Retry fallback" value={`${data.retryFallback} after ${data.maxRetries} attempts`} />
        <Row label="Confirmation style" value={data.confirmationStyle} />
      </Section>
    </>
  );
}

function VerifyScreen({ loading, error, questions, answers, onAnswerChange }) {
  return (
    <>
      <StepHeader
        title="A few things worth double-checking"
        desc="Your form has been submitted. Before the prompt is generated, here's what the agent would like clarified — answer anything that applies."
      />
      {loading && <div className="cb-verify-status">Reviewing your answers…</div>}
      {!loading && error && <div className="cb-verify-status cb-verify-status-error">{error}</div>}
      {!loading && !error && questions.length === 0 && (
        <div className="cb-verify-status">Nothing flagged — your answers look complete. Continue to generate the prompt.</div>
      )}
      {!loading &&
        questions.map((q) => (
          <Field key={q.id} label={q.question}>
            <TextArea
              value={answers[q.id] || ""}
              onChange={(v) => onAnswerChange(q.id, v)}
              rows={2}
              placeholder="Your answer"
            />
          </Field>
        ))}
    </>
  );
}

/* ---------------------------------------------------------
   STYLES
--------------------------------------------------------- */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

.cb-app {
  --ink: #12151c;
  --surface: #1b202b;
  --surface-2: #222838;
  --border: #2b3244;
  --amber: #e8a33d;
  --amber-dim: rgba(232,163,61,0.16);
  --teal: #47c9b6;
  --text: #edeff4;
  --text-muted: #8892a6;
  --danger: #e2604f;
  font-family: 'Inter', sans-serif;
  color: var(--text);
  background: var(--ink);
  border-radius: 16px;
  padding: 20px;
}
.cb-app * { box-sizing: border-box; }

.cb-shell { display: flex; gap: 24px; align-items: flex-start; }

.cb-rail {
  width: 168px;
  flex-shrink: 0;
  position: sticky;
  top: 20px;
}
.cb-brand {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 600;
  font-size: 15px;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
  color: var(--text);
}
.cb-brand-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--amber);
  box-shadow: 0 0 0 0 rgba(232,163,61,0.6);
  animation: cb-pulse 2s infinite;
}
@keyframes cb-pulse {
  0% { box-shadow: 0 0 0 0 rgba(232,163,61,0.5); }
  70% { box-shadow: 0 0 0 6px rgba(232,163,61,0); }
  100% { box-shadow: 0 0 0 0 rgba(232,163,61,0); }
}
.cb-rail-nodes { display: flex; flex-direction: column; gap: 4px; }
.cb-rail-node {
  display: flex; align-items: center; gap: 10px;
  background: none; border: none; cursor: pointer;
  padding: 8px 6px; border-radius: 8px; text-align: left;
  font-family: 'Inter', sans-serif;
}
.cb-rail-node:hover { background: var(--surface); }
.cb-rail-bar {
  width: 4px; height: 22px; border-radius: 2px;
  background: var(--border);
  transition: background 0.2s ease;
}
.cb-rail-node-done .cb-rail-bar { background: var(--amber); }
.cb-rail-node-active .cb-rail-bar { background: var(--teal); box-shadow: 0 0 8px var(--teal); }
.cb-rail-label { font-size: 13px; color: var(--text-muted); }
.cb-rail-node-active .cb-rail-label { color: var(--text); font-weight: 600; }
.cb-rail-node-done .cb-rail-label { color: var(--text); }

.cb-main { flex: 1; min-width: 0; }
.cb-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 28px 30px;
}
.cb-step-header { margin-bottom: 20px; }
.cb-step-title { font-family: 'Space Grotesk', sans-serif; font-size: 20px; margin: 0 0 6px; }
.cb-step-desc { font-size: 13px; color: var(--text-muted); margin: 0; }

.cb-field { margin-bottom: 18px; }
.cb-label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: var(--text); }
.cb-req { color: var(--danger); margin-left: 3px; }
.cb-hint { font-size: 12px; color: var(--text-muted); margin-bottom: 6px; }

.cb-input, .cb-textarea, .cb-select {
  width: 100%;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 9px 11px;
  color: var(--text);
  font-family: 'Inter', sans-serif;
  font-size: 13.5px;
  outline: none;
}
.cb-input:focus, .cb-textarea:focus, .cb-select:focus { border-color: var(--teal); }
.cb-mono { font-family: 'JetBrains Mono', monospace; }
.cb-textarea { resize: vertical; }
.cb-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }

.cb-toggle {
  display: inline-flex; align-items: center; gap: 8px;
  background: none; border: none; cursor: pointer; padding: 4px 0;
}
.cb-toggle-track {
  width: 38px; height: 20px; border-radius: 999px;
  background: var(--border); position: relative; transition: background 0.2s ease;
}
.cb-toggle-on .cb-toggle-track { background: var(--amber); }
.cb-toggle-thumb {
  position: absolute; top: 2px; left: 2px;
  width: 16px; height: 16px; border-radius: 50%; background: var(--text);
  transition: transform 0.2s ease;
}
.cb-toggle-on .cb-toggle-thumb { transform: translateX(18px); }
.cb-toggle-text { font-size: 13px; color: var(--text-muted); }
.cb-toggle-on .cb-toggle-text { color: var(--text); }

.cb-radio-group { display: flex; flex-direction: column; gap: 6px; }
.cb-radio-option {
  display: flex; align-items: center; gap: 9px;
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: 8px; padding: 8px 12px; cursor: pointer;
  font-size: 13px; color: var(--text-muted); text-align: left;
  font-family: 'Inter', sans-serif;
}
.cb-radio-dot { width: 9px; height: 9px; border-radius: 50%; border: 1.5px solid var(--text-muted); flex-shrink: 0; }
.cb-radio-active { border-color: var(--teal); color: var(--text); }
.cb-radio-active .cb-radio-dot { background: var(--teal); border-color: var(--teal); }

.cb-chip-group { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 8px; }
.cb-chip {
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: 999px; padding: 6px 12px; font-size: 12.5px;
  color: var(--text-muted); cursor: pointer; font-family: 'Inter', sans-serif;
}
.cb-chip-active { background: var(--amber-dim); border-color: var(--amber); color: var(--amber); }

.cb-repeat-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
.cb-repeat-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; flex: 1; }
.cb-icon-btn {
  background: var(--surface-2); border: 1px solid var(--border); border-radius: 6px;
  padding: 8px; color: var(--text-muted); cursor: pointer; flex-shrink: 0;
}
.cb-icon-btn:hover { color: var(--danger); border-color: var(--danger); }
.cb-add-row {
  display: inline-flex; align-items: center; gap: 6px;
  background: none; border: 1px dashed var(--border); border-radius: 8px;
  padding: 7px 12px; color: var(--teal); font-size: 12.5px; cursor: pointer;
  font-family: 'Inter', sans-serif;
}

.cb-nav { display: flex; justify-content: space-between; margin-top: 18px; }
.cb-btn {
  display: inline-flex; align-items: center; gap: 6px;
  border-radius: 8px; padding: 10px 18px; font-size: 13.5px; font-weight: 600;
  cursor: pointer; border: 1px solid var(--border); font-family: 'Inter', sans-serif;
}
.cb-btn-ghost { background: none; color: var(--text-muted); }
.cb-btn-ghost:disabled { opacity: 0.35; cursor: default; }
.cb-btn-primary { background: var(--amber); color: #1a1400; border-color: var(--amber); margin-left: auto; }

.cb-review-section { border-top: 1px solid var(--border); padding: 14px 0; }
.cb-review-section:first-child { border-top: none; padding-top: 0; }
.cb-review-section-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.cb-review-section-head h3 { font-size: 14px; font-family: 'Space Grotesk', sans-serif; margin: 0; }
.cb-edit-link {
  display: inline-flex; align-items: center; gap: 5px;
  background: none; border: none; color: var(--teal); font-size: 12px; cursor: pointer;
  font-family: 'Inter', sans-serif;
}
.cb-review-row { display: flex; gap: 10px; font-size: 13px; padding: 3px 0; }
.cb-review-key { color: var(--text-muted); min-width: 150px; flex-shrink: 0; }
.cb-review-val { color: var(--text); }

.cb-verify-status {
  background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px;
  padding: 14px 16px; font-size: 13.5px; color: var(--text-muted); margin-bottom: 16px;
}
.cb-verify-status-error { border-color: var(--danger); color: var(--text); }

.cb-output-wrap { position: relative; }
.cb-copy-btn {
  position: absolute; top: 10px; right: 10px;
  display: inline-flex; align-items: center; gap: 6px;
  background: var(--surface-2); border: 1px solid var(--border);
  color: var(--text); font-size: 12px; padding: 7px 12px; border-radius: 7px; cursor: pointer;
  font-family: 'Inter', sans-serif;
}
.cb-output-panel {
  background: #0d0f15; border: 1px solid var(--border); border-radius: 10px;
  padding: 20px; font-family: 'JetBrains Mono', monospace; font-size: 12.2px;
  line-height: 1.6; white-space: pre-wrap; color: #d7dbe3; max-height: 560px; overflow-y: auto;
}

@media (max-width: 760px) {
  .cb-shell { flex-direction: column; }
  .cb-rail { width: 100%; position: static; }
  .cb-rail-nodes { flex-direction: row; overflow-x: auto; gap: 14px; padding-bottom: 4px; }
  .cb-rail-node { flex-direction: column; gap: 4px; padding: 4px; }
  .cb-rail-bar { width: 22px; height: 4px; }
  .cb-row-2 { grid-template-columns: 1fr; }
  .cb-review-key { min-width: 110px; }
}
`;
