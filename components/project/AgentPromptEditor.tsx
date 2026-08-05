import React, { useState } from 'react';
import { PromptPackageDraft } from '@/lib/llm/types';
import { SidebarGroup, SidebarLink, ToolChip, CompactRow } from './EditorComponents';
import { FileText, Settings, Wrench, Variable, Check, Copy, ArrowRight, Loader2, ArrowLeft, AlertTriangle } from 'lucide-react';


interface Props {
  draft: PromptPackageDraft;
  onChangeDraft: (draft: PromptPackageDraft) => void;
  onSave: () => Promise<void>;
  onBack: () => void;
  saving?: boolean;
}

export const AgentPromptEditor: React.FC<Props> = ({ draft, onChangeDraft, onSave, onBack, saving }) => {
  const [activeTab, setActiveTab] = useState<'prompt' | 'settings' | 'tools' | 'variables'>('prompt');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard?.writeText(draft.finalPrompt || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePromptChange = (val: string) => {
    onChangeDraft({ ...draft, finalPrompt: val });
  };

  const warnings = draft.validationWarnings ?? [];
  const errors = draft.validationErrors ?? [];

  return (
    <div className="w-full max-w-[1200px] mx-auto px-6 py-6 h-screen flex flex-col">
       <div className="flex shrink-0 items-center justify-between mb-6">
          <div className="flex items-center gap-3">
             <button type="button" onClick={onBack} className="icon-btn shrink-0" aria-label="Back to Review">
               <ArrowLeft className="w-4 h-4" />
             </button>
             <div>
                <h1 className="text-[20px] font-semibold text-ink leading-tight">Agent Editor</h1>
                <p className="text-[13px] text-graphite">Refine the generated prompt, variables, and tools.</p>
             </div>
          </div>
          <div className="flex gap-2">
             <button type="button" className="btn btn-secondary" onClick={() => alert('Testing agent is not yet implemented.')}>Test Agent</button>
             <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving}>
               {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <>Save Project <ArrowRight className="w-4 h-4" /></>}
             </button>
          </div>
       </div>

       <div className="flex-1 flex gap-6 min-h-0 overflow-hidden">
          <div className="w-[240px] shrink-0 flex flex-col overflow-y-auto pr-2">
             <SidebarGroup title="Configuration">
                <SidebarLink icon={FileText} label="System Prompt" isActive={activeTab === 'prompt'} onClick={() => setActiveTab('prompt')} />
                <SidebarLink icon={Settings} label="Settings" isActive={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
             </SidebarGroup>
             <SidebarGroup title="Integrations">
                <SidebarLink icon={Wrench} label="Function Tools" isActive={activeTab === 'tools'} onClick={() => setActiveTab('tools')} />
                <SidebarLink icon={Variable} label="Call Variables" isActive={activeTab === 'variables'} onClick={() => setActiveTab('variables')} />
             </SidebarGroup>
          </div>

          <div className="flex-1 flex flex-col min-w-0">
             {(errors.length > 0 || warnings.length > 0) && (
               <div className="card shrink-0 mb-4 border-warning/30 bg-warning-soft p-4">
                 <p className="flex items-center gap-2 text-[13px] font-semibold text-warning mb-2">
                   <AlertTriangle className="w-4 h-4" aria-hidden="true" /> Reviewer notes
                 </p>
                 <ul className="space-y-1 text-[12px] text-ink-soft list-disc pl-5">
                   {[...errors, ...warnings].slice(0, 12).map((m, i) => <li key={i}>{m}</li>)}
                 </ul>
               </div>
             )}

             {activeTab === 'prompt' && (
               <div className="card flex min-h-0 flex-1 flex-col overflow-hidden animate-slide-up">
                  <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-2.5 bg-subtle/30">
                    <span className="text-[13px] font-medium text-ink">Compiled System Prompt</span>
                    <button type="button" onClick={handleCopy} className="link inline-flex items-center gap-1.5 text-[12px]">
                       {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <textarea
                    value={draft.finalPrompt}
                    onChange={(e) => handlePromptChange(e.target.value)}
                    spellCheck={false}
                    className="flex-1 resize-none border-0 bg-surface p-4 font-mono text-[13px] leading-[1.6] text-ink-soft outline-none"
                  />
               </div>
             )}
             
             {activeTab === 'settings' && (
               <div className="card p-6 overflow-y-auto animate-fade-in-up">
                  <h2 className="text-[16px] font-semibold text-ink mb-6">Agent Settings</h2>
                  <div className="space-y-6">
                     <div>
                       <label className="block text-[13px] font-medium text-ink mb-1.5">Primary Language</label>
                       <select 
                         className="input-field max-w-sm" 
                         value={draft.businessSpec?.meta?.languageMode || 'english'}
                         onChange={(e) => {
                            const newDraft = { ...draft };
                            if (newDraft.businessSpec) {
                              newDraft.businessSpec.meta.languageMode = e.target.value as any;
                            }
                            onChangeDraft(newDraft);
                         }}
                       >
                         <option value="english">English (US)</option>
                         <option value="hindi">Hindi</option>
                         <option value="hinglish">Hinglish</option>
                         <option value="multilingual">Multilingual</option>
                       </select>
                       <p className="text-[12px] text-graphite mt-1.5">The primary language the agent will speak.</p>
                     </div>
                     <div>
                       <label className="block text-[13px] font-medium text-ink mb-1.5">Primary Goal</label>
                       <input 
                         type="text"
                         className="input-field" 
                         value={draft.businessSpec?.meta?.primaryGoal || ''}
                         onChange={(e) => {
                            const newDraft = { ...draft };
                            if (newDraft.businessSpec) {
                              newDraft.businessSpec.meta.primaryGoal = e.target.value;
                            }
                            onChangeDraft(newDraft);
                         }}
                       />
                     </div>
                  </div>
               </div>
             )}

             {activeTab === 'tools' && (
               <div className="card p-6 overflow-y-auto animate-fade-in-up">
                  <h2 className="text-[16px] font-semibold text-ink mb-2">Function Tools</h2>
                  <p className="text-[13px] text-graphite mb-6">Tools the agent can call during the conversation.</p>
                  <div className="flex flex-wrap gap-2 mb-4">
                     {(draft.suggestedFunctions || []).map((t, i) => (
                        <ToolChip key={i} name={t.name} />
                     ))}
                     {(!draft.suggestedFunctions || draft.suggestedFunctions.length === 0) && (
                        <p className="text-[13px] text-faint italic">No tools suggested for this prompt.</p>
                     )}
                  </div>
               </div>
             )}

             {activeTab === 'variables' && (
               <div className="card p-6 overflow-y-auto animate-fade-in-up">
                  <h2 className="text-[16px] font-semibold text-ink mb-2">Call Variables</h2>
                  <p className="text-[13px] text-graphite mb-6">Variables extracted or injected into the prompt.</p>
                  <div>
                     {(draft.dynamicVariables || []).map((v, i) => (
                        <CompactRow key={i} onRemove={() => {
                           const newVars = [...draft.dynamicVariables];
                           newVars.splice(i, 1);
                           onChangeDraft({ ...draft, dynamicVariables: newVars });
                        }}>
                           <div className="flex items-center justify-between">
                              <div>
                                 <div className="text-[13px] font-medium text-ink font-mono">{v.key}</div>
                                 <div className="text-[12px] text-graphite">{v.description || 'No description'}</div>
                              </div>
                              <div className="text-[11px] uppercase tracking-wider text-faint border border-line rounded px-1.5 py-0.5">
                                 {v.fieldDirection === 'infield' ? 'Injected' : 'Extracted'}
                              </div>
                           </div>
                        </CompactRow>
                     ))}
                     {(!draft.dynamicVariables || draft.dynamicVariables.length === 0) && (
                        <p className="text-[13px] text-faint italic">No dynamic variables defined.</p>
                     )}
                  </div>
               </div>
             )}
          </div>
       </div>
    </div>
  );
};
