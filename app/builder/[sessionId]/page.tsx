'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  BuilderForm,
  PersonaCard,
  CompletionDot,
  initialData,
  getModuleCompletion,
  getBlockingGaps,
  MODULES,
  MODULE_ORDER,
  type BuilderData,
  type ModuleId,
} from '@/components/project/BuilderForm';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle,
  Edit3,
  Loader2,
  AlertTriangle,
  Copy,
} from 'lucide-react';
import type { PromptPackageDraft } from '@/lib/llm/types';
import { AgentPromptEditor } from '@/components/project/AgentPromptEditor';

type Stage = 'form' | 'questions' | 'review' | 'editor';

function ReviewField({ label, value, onChange, rows = 2, mono }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number; mono?: boolean;
}) {
  return (
    <div className="mb-4">
      <span className="block text-[13px] font-medium text-graphite mb-1.5">{label}</span>
      {rows === 1 ? (
        <input className={`input-field ${mono ? 'font-mono text-[13px]' : ''}`} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <textarea className={`input-field resize-y ${mono ? 'font-mono text-[13px]' : ''}`} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

function ReviewStatic({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="mb-3">
      <span className="block text-[13px] font-medium text-graphite mb-0.5">{label}</span>
      <p className="text-[14px] text-ink whitespace-pre-wrap">{value}</p>
    </div>
  );
}

export default function FormBuilderPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode') || 'auto';
  
  const [sessionId, setSessionId] = useState('');
  const [loading, setLoading] = useState(true);

  const [data, setData] = useState<BuilderData>(initialData);
  const [activeModule, setActiveModule] = useState<ModuleId>('persona');

  const [stage, setStage] = useState<Stage>('form');
  const [evaluating, setEvaluating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [gaps, setGaps] = useState<string[]>([]);

  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});

  const [draft, setDraft] = useState<PromptPackageDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, boolean>>({});

  useEffect(() => {
    params.then((p) => {
      setSessionId(p.sessionId);
      if (mode === 'scratch') {
        setDraft({
          finalPrompt: '',
          dynamicVariables: [],
          suggestedFunctions: [],
          knowledgeBaseSuggestions: [],
          faqCards: [],
          objectionCards: [],
          edgeCaseRules: [],
          testScenarios: [],
          qualityReview: {
            overallScore: 0,
            completionScore: 0,
            safetyScore: 0,
            voiceStyleScore: 0,
            structureScore: 0,
            edgeCaseScore: 0,
            humanQualityScore: 0,
            hallucinationResistanceScore: 0,
            minimumManualEditScore: 0,
            issues: [],
            recommendedImprovements: [],
            readyToPublish: false,
          },
        });
        setStage('editor');
      }
      setLoading(false);
    });
  }, [params, mode]);

  const completions = useMemo(
    () => MODULE_ORDER.map((id) => ({ id, status: getModuleCompletion(id, data) })),
    [data],
  );
  const progress = Math.round(
    (completions.filter((c) => c.status === 'complete').length / MODULE_ORDER.length) * 100,
  );

  /* ── Step 1: judge review ─────────────────────────────────────── */
  const handleSubmitForm = async () => {
    const blocking = getBlockingGaps(data);
    setGaps(blocking);
    
    const errors = {
      companyName: !data.companyName.trim(),
      callPurpose: !data.callPurpose.trim(),
      callFlow: !data.callFlow.trim(),
    };
    setValidationErrors(errors);

    if (blocking.length > 0) return;

    setError('');
    setEvaluating(true);
    try {
      const res = await fetch('/api/builder/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form: data, sessionId }),
      });
      const out = await res.json();
      const qs: string[] = Array.isArray(out?.questions) ? out.questions.slice(0, 5) : [];
      if (qs.length > 0) {
        setQuestions(qs);
        setAnswers({});
        setStage('questions');
      } else {
        setStage('review');
      }
    } catch {
      setError('The reviewer could not be reached. You can continue to the review step anyway.');
      setStage('review');
    } finally {
      setEvaluating(false);
    }
  };

  /* ── Step 3: compile ──────────────────────────────────────────── */
  const handleGenerate = async () => {
    setError('');
    setGenerating(true);
    try {
      const clarifications = questions.reduce<Record<string, string>>((acc, q, i) => {
        if (answers[i]?.trim()) acc[q] = answers[i].trim();
        return acc;
      }, {});
      const res = await fetch('/api/builder/generate-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form: data, clarifications, sessionId }),
      });
      if (!res.ok) throw new Error('compile failed');
      const out = await res.json();
      setDraft(out);
      setStage('editor');
    } catch {
      setError('Compilation failed. Check the server logs and try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveProject = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/builder/create-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          draft,
          blueprint: {
            business: { businessName: data.companyName, industry: data.industry, agentName: data.agentName },
            useCase: data.callPurpose,
            languageMode: draft?.businessSpec?.meta?.languageMode || 'english',
            conversation: { opening: data.openingMessage },
          },
        }),
      });
      const project = await res.json();
      if (project?.id) router.push(`/project/${project.id}`);
      else throw new Error('no project id');
    } catch {
      setError('Could not save the project workspace.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center gap-2 text-graphite text-[14px]">
        <Loader2 className="w-4 h-4 animate-spin" /> Initializing session…
      </div>
    );
  }

  /* ═══════════════ STAGE: editor ═══════════════ */
  if (stage === 'editor' && draft) {
    return (
      <AgentPromptEditor
        mode={mode as 'auto' | 'scratch'}
        draft={draft}
        onChangeDraft={setDraft}
        onSave={handleSaveProject}
        onBack={() => {
          if (mode === 'scratch') router.push('/dashboard');
          else {
            setStage('review');
            setDraft(null);
          }
        }}
        saving={saving}
      />
    );
  }

  /* ═══════════════ STAGE: final review (editable) ═══════════════ */
  if (stage === 'review') {
    const answered = questions.filter((_, i) => answers[i]?.trim());
    return (
      <div className="w-full max-w-3xl mx-auto px-6 py-10 pb-28">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-[20px] font-semibold text-ink mb-1">Final review</h1>
            <p className="text-[14px] text-graphite">Edit anything here before we compile. Changes are saved into the build.</p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => setStage('form')}>
            <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back to builder
          </button>
        </div>

        <div className="card mb-4 p-5">
          <h2 className="text-[16px] font-semibold text-ink mb-4">Persona</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
            <ReviewField label="Company name" rows={1} value={data.companyName} onChange={(v) => setData((d) => ({ ...d, companyName: v }))} />
            <ReviewField label="Agent name" rows={1} value={data.agentName} onChange={(v) => setData((d) => ({ ...d, agentName: v }))} />
          </div>
          <ReviewField label="Call purpose" rows={3} value={data.callPurpose} onChange={(v) => setData((d) => ({ ...d, callPurpose: v }))} />
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-graphite pt-1">
            <span>Direction: <span className="text-ink">{data.callDirection}</span></span>
            <span>Industry: <span className="text-ink">{data.industry || '—'}</span></span>
            <span>Region: <span className="text-ink">{data.region || 'Generic'}</span></span>
            <span>Language: <span className="text-ink">{data.primaryLanguage}{data.secondaryLanguage !== 'None' ? ` + ${data.secondaryLanguage}` : ''}</span></span>
            <span>Voice: <span className="text-ink">{data.voiceGender}</span></span>
          </div>
        </div>

        <div className="card mb-4 p-5">
          <h2 className="text-[16px] font-semibold text-ink mb-4">Conversation</h2>
          <ReviewField label="Opening message" rows={3} value={data.openingMessage} onChange={(v) => setData((d) => ({ ...d, openingMessage: v }))} />
          <ReviewField label="Call flow" rows={8} mono value={data.callFlow} onChange={(v) => setData((d) => ({ ...d, callFlow: v }))} />
          <ReviewStatic
            label="Variables"
            value={data.variables.filter((v) => v.key.trim()).map((v) => `{{${v.key}}}${v.value ? ` = ${v.value}` : ''}`).join('\n')}
          />
        </div>

        <div className="card mb-4 p-5">
          <h2 className="text-[16px] font-semibold text-ink mb-4">Knowledge base</h2>
          {data.kbEnabled && data.kbContent.trim() ? (
            <ReviewField label="Source content (facts get extracted into the prompt)" rows={8} value={data.kbContent} onChange={(v) => setData((d) => ({ ...d, kbContent: v }))} />
          ) : (
            <p className="text-[13px] text-graphite">Not provided — the agent will answer only from the persona and flow above.</p>
          )}
        </div>

        <div className="card mb-4 p-5">
          <h2 className="text-[16px] font-semibold text-ink mb-4">Guardrails &amp; call handling</h2>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-graphite">
            <span>AI disclosure: <span className="text-ink">{data.discloseAI ? 'Yes' : 'No'}</span></span>
            <span>Recording consent: <span className="text-ink">{data.recordingConsent ? 'Yes' : 'No'}</span></span>
            <span>Digression: <span className="text-ink">{data.digressionHandling}</span></span>
            <span>Fallback: <span className="text-ink">{data.retryFallback} after {data.maxRetries}</span></span>
          </div>
          {data.liveTransferEnabled && (
            <div className="mt-3">
              <ReviewStatic
                label="Live transfer"
                value={[
                  ...data.transferNumbers.filter((t) => t.number.trim()).map((t) => `${t.label || 'Transfer'}: ${t.number}`),
                  ...(data.transferTriggers.length ? [`Triggers: ${data.transferTriggers.join('; ')}`] : []),
                  ...(data.afterHoursBehavior ? [`If unavailable: ${data.afterHoursBehavior}`] : []),
                ].join('\n')}
              />
            </div>
          )}
        </div>

        {questions.length > 0 && (
          <div className="card mb-4 p-5">
            <h2 className="flex items-center gap-2 text-[16px] font-semibold text-ink mb-4">
              <Bot className="h-4 w-4 text-graphite" aria-hidden="true" /> Reviewer clarifications
            </h2>
            {answered.length === 0 && <p className="text-[13px] text-graphite mb-3">You skipped these — the compiler will use its own judgement.</p>}
            {questions.map((q, i) => (
              <div key={i} className="mb-4">
                <p className="text-[13px] font-medium text-graphite mb-1.5">{i + 1}. {q}</p>
                <textarea className="input-field resize-y" rows={2} value={answers[i] || ''}
                  placeholder="Your answer (optional)"
                  onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))} />
              </div>
            ))}
          </div>
        )}

        {error && <p className="mb-4 text-[13px] text-warning">{error}</p>}

        <div className="fixed bottom-0 left-0 right-0 border-t border-line bg-surface px-6 py-3 z-40">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
            <span className="text-[13px] text-graphite">Everything above goes into the compiler.</span>
            <button type="button" className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
              {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Compiling…</> : <>Build prompt <ArrowRight className="w-4 h-4" /></>}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════════ STAGE: builder ═══════════════ */
  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] bg-canvas">
      {/* Top bar */}
      <header className="shrink-0 bg-surface border-b border-line px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 z-20">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-[16px] font-semibold text-ink truncate">
            {data.companyName ? `${data.companyName} agent` : 'Build your agent'}
          </h1>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-subtle text-graphite font-medium">{data.callDirection}</span>
        </div>
        <div className="flex items-center gap-5">
          <div className="hidden sm:flex items-center gap-2.5 text-[13px]">
            <span className="font-medium text-ink tabular-nums">{progress}%</span>
            <div className="w-28 h-2 bg-subtle rounded-full overflow-hidden" role="progressbar"
              aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Build progress">
              <div className="h-full bg-success transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <button type="button" className="btn btn-primary" onClick={handleSubmitForm} disabled={evaluating}>
            {evaluating ? <><Loader2 className="w-4 h-4 animate-spin" /> Reviewing…</> : <>Submit for review <ArrowRight className="w-4 h-4" /></>}
          </button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Module nav */}
        <nav aria-label="Builder sections" className="hidden md:block w-72 lg:w-80 shrink-0 border-r border-line p-5 overflow-y-auto bg-canvas/40">
          <div className="space-y-2">
            {completions.map(({ id, status }) => {
              const Icon = MODULES[id].icon;
              return (
                <button key={id} type="button"
                  className={`flex w-full items-start gap-3 rounded-xl px-3.5 py-3 text-left transition-all ${
                    activeModule === id ? 'bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)] ring-1 ring-line text-ink' : 'text-graphite hover:bg-subtle hover:text-ink'
                  }`}
                  aria-current={activeModule === id ? 'step' : undefined}
                  onClick={() => setActiveModule(id)}>
                  <div className="pt-0.5"><CompletionDot status={status} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className={`w-4 h-4 shrink-0 ${activeModule === id ? 'text-accent' : ''}`} aria-hidden="true" />
                      <span className={`text-[14px] font-bold truncate ${activeModule === id ? 'text-ink' : ''}`}>{MODULES[id].label}</span>
                    </div>
                    <p className={`text-[12px] leading-relaxed ${activeModule === id ? 'text-ink-soft' : 'text-graphite line-clamp-2'}`}>{MODULES[id].blurb}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Builder */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-8 min-w-0">
          <div className="max-w-3xl mx-auto">
            {/* Mobile module tabs */}
            <div className="md:hidden flex gap-2 overflow-x-auto pb-3 mb-4 -mx-1 px-1">
              {completions.map(({ id, status }) => (
                <button key={id} type="button" onClick={() => setActiveModule(id)}
                  className={`shrink-0 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-medium border transition-colors ${
                    activeModule === id ? 'border-ink bg-surface text-ink' : 'border-line bg-transparent text-graphite'
                  }`}>
                  <CompletionDot status={status} />
                  {MODULES[id].label}
                </button>
              ))}
            </div>

            <PersonaCard data={data} />

            {gaps.length > 0 && (
              <div className="card mb-6 border-warning/30 bg-warning-soft p-4">
                <p className="flex items-center gap-2 text-[13px] font-semibold text-warning mb-2">
                  <AlertTriangle className="w-4 h-4" aria-hidden="true" /> Fill these in before submitting
                </p>
                <ul className="space-y-1 text-[13px] text-ink-soft list-disc pl-5">
                  {gaps.map((g) => <li key={g}>{g}</li>)}
                </ul>
              </div>
            )}

            <BuilderForm data={data} setData={setData} activeModule={activeModule} setActiveModule={setActiveModule} validationErrors={validationErrors} setValidationErrors={setValidationErrors} />
          </div>
        </main>
      </div>

      {/* Judge questions */}
      {stage === 'questions' && (
        <div className="fixed inset-0 z-50 bg-ink/30 flex items-center justify-center p-4 animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="judge-title">
          <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-line bg-surface p-6 shadow-lg sm:p-8 animate-fade-in-up">
            <div className="flex items-start gap-3 mb-6">
              <div className="rounded-full bg-accent-soft p-2.5 shrink-0 text-accent mt-0.5">
                <Bot className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <h3 id="judge-title" className="text-[16px] font-semibold text-ink">A few clarifying questions</h3>
                <p className="text-[13px] text-graphite">
                  Our reviewer read your setup and found {questions.length} thing{questions.length === 1 ? '' : 's'} worth
                  pinning down. Answer what you can — blanks are fine.
                </p>
              </div>
            </div>

            <div className="space-y-5">
              {questions.map((q, i) => (
                <div key={i}>
                  <label htmlFor={`q-${i}`} className="block text-[14px] font-medium text-ink mb-1.5">{i + 1}. {q}</label>
                  <textarea id={`q-${i}`} rows={2} className="input-field resize-y" placeholder="Your answer…"
                    value={answers[i] || ''} onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))} />
                </div>
              ))}
            </div>

            <div className="mt-7 flex flex-wrap justify-end gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => setStage('form')}>Back to builder</button>
              <button type="button" className="btn btn-primary" onClick={() => setStage('review')}>
                Continue to review <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}

      {error && stage === 'form' && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-surface border border-warning/40 rounded-md px-4 py-2 text-[13px] text-warning shadow-md">
          {error}
        </div>
      )}
    </div>
  );
}
