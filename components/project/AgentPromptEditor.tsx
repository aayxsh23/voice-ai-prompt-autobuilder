import React, { useState } from 'react';
import { PromptPackageDraft } from '@/lib/llm/types';
import { SidebarGroup, SidebarLink, ToolChip, CompactRow } from './EditorComponents';
import { FileText, Settings, Wrench, Variable, Check, Copy, Loader2, ArrowLeft, AlertTriangle, UserCircle, ListTree, Brain, Shield, Zap, ChevronDown, Activity, Phone, Send, Pencil, Eye } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useRef } from 'react';

interface Props {
  projectName?: string;
  draft: PromptPackageDraft;
  onChangeDraft: (draft: PromptPackageDraft) => void;
  onSave: () => Promise<void>;
  onBack: () => void;
  saving?: boolean;
  mode?: 'auto' | 'scratch';
}

export const AgentPromptEditor: React.FC<Props> = ({ projectName, draft, onChangeDraft, onSave, onBack, saving, mode = 'auto' }) => {
  const [activeTab, setActiveTab] = useState<'prompt' | 'settings' | 'tools' | 'variables' | 'outcomes'>('prompt');
  const [editMode, setEditMode] = useState<Record<string, boolean>>({});

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

  const infieldVariables = draft.dynamicVariables?.filter(v => v.fieldDirection === 'infield') || [];
  const outfieldVariables = draft.dynamicVariables?.filter(v => v.fieldDirection === 'outfield') || [];

  return (
    <div className="flex flex-col h-full w-full bg-canvas animate-fade-in-up">
       <header className="shrink-0 bg-white border-b border-line px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 z-20">
          <div className="flex items-center gap-3 min-w-0">
             <button type="button" onClick={onBack} className="icon-btn shrink-0 hover:bg-subtle hover:text-ink hover:border-line-strong !border-transparent" aria-label="Back">
               <ArrowLeft className="w-4 h-4" />
             </button>
             <h1 className="text-[16px] font-semibold text-ink truncate">
                 {projectName ? `${projectName} agent` : 'Agent Configuration'}
             </h1>
             <div className="relative inline-block shrink-0">
                 <select className="appearance-none bg-white hover:bg-subtle border border-line shadow-sm rounded-full pl-3 pr-8 py-1 text-[12px] font-medium text-ink focus:outline-none focus:border-accent cursor-pointer transition-all">
                     <option value="1">Version 1 — You</option>
                 </select>
                 <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-soft pointer-events-none" />
             </div>
          </div>
          <div className="flex items-center gap-3">
             <button type="button" className="btn btn-secondary border-accent text-accent hover:bg-accent-soft bg-white" onClick={() => alert('Testing agent is not yet implemented.')}>
               <Phone className="w-4 h-4" /> Test Agent
             </button>
             <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving}>
               {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Send className="w-4 h-4" /> Publish</>}
             </button>
          </div>
       </header>

       <div className="flex-1 flex min-h-0">
          <div className="hidden md:block w-56 lg:w-64 bg-white border-r border-line p-4 overflow-y-auto shrink-0 z-10">
             <SidebarGroup title="Agent Behavior">
                <SidebarLink icon={FileText} label="Prompt" isActive={activeTab === 'prompt'} onClick={() => setActiveTab('prompt')} />
             </SidebarGroup>
             <SidebarGroup title="Call Configuration">
                <SidebarLink icon={Settings} label="Settings" isActive={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
                <SidebarLink icon={Wrench} label="Function Tools" isActive={activeTab === 'tools'} onClick={() => setActiveTab('tools')} />
             </SidebarGroup>
             <SidebarGroup title="Data Schema">
                <SidebarLink icon={Variable} label="Call Variables" isActive={activeTab === 'variables'} onClick={() => setActiveTab('variables')} />
                <SidebarLink icon={Activity} label="Call Outcomes" isActive={activeTab === 'outcomes'} onClick={() => setActiveTab('outcomes')} />
             </SidebarGroup>
          </div>

          <div className="flex-1 overflow-y-auto p-6 lg:p-10">
             <div className="max-w-4xl mx-auto pb-24 flex flex-col min-w-0">
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
                <div className="flex-1 flex gap-6 overflow-hidden animate-fade-in-up">
                    <div className="flex-1 flex flex-col gap-6 overflow-y-auto pr-2 pb-10">
                        
                        <div className="mb-4">
                            <span className="block text-[11px] font-semibold text-graphite/70 uppercase tracking-wider mb-2">Basics</span>
                            <div className="card p-6 bg-white shadow-sm mb-2">
                                <div className="flex items-start justify-between mb-4">
                                    <div>
                                        <h3 className="text-[16px] font-semibold text-ink">Agent Prompt</h3>
                                        <p className="text-[13px] text-graphite mt-1 max-w-xl leading-relaxed">
                                            Define the core identity, behavior, and knowledge base of your agent.
                                        </p>
                                    </div>
                                    <button type="button" onClick={handleCopy} className="btn btn-secondary h-8 px-3 text-[12px] bg-white">
                                        {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy Full Prompt'}
                                    </button>
                                </div>
                                <div className="space-y-4">
                                    <div>
                                        <label className="flex items-center gap-2 text-[14px] font-medium text-ink mb-1.5">Agent Name</label>
                                        <input className="input-field max-w-sm" disabled value={projectName ? `${projectName} agent` : 'Agent'} />
                                        <p className="flex items-start gap-1.5 text-[12px] leading-[1.5] text-graphite pt-1.5">
                                            <AlertTriangle className="w-[13px] h-[13px] shrink-0 mt-[2px]" />
                                            <span>Name editing is disabled here. Use the 3-dots menu on the Home page to rename.</span>
                                        </p>
                                    </div>
                                    {draft.businessSpec?.meta?.openingPhrase && (
                                        <div className="pt-2">
                                            <label className="flex items-center gap-2 text-[14px] font-medium text-ink mb-1.5">Opening Line</label>
                                            <textarea 
                                                className="input-field w-full min-h-[60px] resize-none bg-subtle/30" 
                                                disabled 
                                                value={draft.businessSpec.meta.openingPhrase} 
                                            />
                                            <p className="text-[12px] text-graphite pt-1.5">
                                                This is the exact first line the agent will speak when the call connects.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        {mode === 'scratch' ? (
                            <div className="card flex-1 flex flex-col h-full border-0 shadow-none bg-transparent">
                                <textarea
                                    value={draft.finalPrompt || ''}
                                    onChange={(e) => handlePromptChange(e.target.value)}
                                    spellCheck={false}
                                    placeholder="Write your custom agent prompt here..."
                                    className="w-full h-full min-h-[500px] flex-1 resize-none border border-line rounded-lg bg-surface p-4 font-mono text-[13px] leading-[1.6] text-ink-soft outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                />
                            </div>
                        ) : (
                            <div className="card bg-white shadow-sm overflow-hidden">
                                <div className="p-4 flex flex-col h-full animate-fade-in">
                                    <div className="flex justify-between items-center mb-4">
                                        <div>
                                            <span className="block text-[14px] font-semibold text-ink">System Prompt</span>
                                            <span className="block text-[12px] text-graphite">The complete compiled instructions for the AI.</span>
                                        </div>
                                        <button 
                                            type="button" 
                                            onClick={() => setEditMode(prev => ({ ...prev, full: !prev.full }))}
                                            className="flex items-center gap-1.5 text-[11px] font-medium text-graphite hover:text-ink transition-colors bg-subtle/50 px-2 py-1 rounded-md"
                                        >
                                            {editMode['full'] ? (
                                                <><Eye className="w-3 h-3" /> Preview</>
                                            ) : (
                                                <><Pencil className="w-3 h-3" /> Edit Mode</>
                                            )}
                                        </button>
                                    </div>
                                    <div className="relative flex-1">
                                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-accent rounded-l"></div>
                                        {editMode['full'] ? (
                                            <textarea
                                                value={draft.finalPrompt || ''}
                                                onChange={(e) => handlePromptChange(e.target.value)}
                                                spellCheck={false}
                                                className="w-full min-h-[500px] resize-y font-mono text-[13px] leading-relaxed focus:border-accent focus:ring-1 focus:ring-accent-soft pl-4 bg-canvas/30 text-ink-soft outline-none border border-line rounded-md py-3"
                                            />
                                        ) : (
                                            <div className="w-full min-h-[500px] max-h-[800px] overflow-y-auto pl-5 pr-4 py-3 bg-white border border-line rounded-md prose prose-sm max-w-none">
                                                <ReactMarkdown
                                                    components={{
                                                        h1: ({node, ...props}) => <h1 className="text-xl font-bold mt-4 mb-2 text-ink" {...props} />,
                                                        h2: ({node, ...props}) => <h2 className="text-lg font-bold mt-4 mb-2 text-ink" {...props} />,
                                                        h3: ({node, ...props}) => <h3 className="text-base font-bold mt-3 mb-1 text-ink" {...props} />,
                                                        p: ({node, ...props}) => <p className="mb-2 leading-relaxed" {...props} />,
                                                        ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-2 space-y-1" {...props} />,
                                                        ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-2 space-y-1" {...props} />,
                                                        li: ({node, ...props}) => <li className="pl-1" {...props} />,
                                                        code: ({node, className, children, ...props}) => {
                                                            const match = /language-(\w+)/.exec(className || '');
                                                            const isInline = !match && !className;
                                                            return isInline ? (
                                                                <code className="bg-subtle text-ink-strong px-1.5 py-0.5 rounded text-[0.9em] font-mono" {...props}>{children}</code>
                                                            ) : (
                                                                <code className="block bg-surface border border-line rounded-md p-3 text-[12px] overflow-x-auto text-ink-soft font-mono" {...props}>{children}</code>
                                                            );
                                                        }
                                                    }}
                                                >
                                                    {draft.finalPrompt || '*No prompt generated.*'}
                                                </ReactMarkdown>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
             )}
             
             {activeTab === 'settings' && (
               <div className="card p-6 overflow-y-auto animate-fade-in-up">
                  <h2 className="text-[16px] font-semibold text-ink mb-6">Agent Settings</h2>
                  <div className="space-y-6">
                     <div>
                       <label className="block text-[13px] font-medium text-ink mb-3">Language Mode</label>
                       
                       <div className="flex bg-subtle p-1 rounded-lg w-max mb-4">
                           <button
                               type="button"
                               className={`px-4 py-1.5 text-[13px] font-medium rounded-md transition-colors ${draft.businessSpec?.meta?.languageMode !== 'multilingual' ? 'bg-white text-ink shadow-sm' : 'text-graphite hover:text-ink'}`}
                               onClick={() => {
                                   const newDraft = { ...draft };
                                   if (newDraft.businessSpec) {
                                       newDraft.businessSpec.meta.languageMode = (newDraft.businessSpec.meta.primaryLanguage || 'english').toLowerCase() as any;
                                   }
                                   onChangeDraft(newDraft);
                               }}
                           >
                               Single Language
                           </button>
                           <button
                               type="button"
                               className={`px-4 py-1.5 text-[13px] font-medium rounded-md transition-colors ${draft.businessSpec?.meta?.languageMode === 'multilingual' ? 'bg-white text-ink shadow-sm' : 'text-graphite hover:text-ink'}`}
                               onClick={() => {
                                   const newDraft = { ...draft };
                                   if (newDraft.businessSpec) {
                                       newDraft.businessSpec.meta.languageMode = 'multilingual';
                                   }
                                   onChangeDraft(newDraft);
                               }}
                           >
                               Multilingual
                           </button>
                       </div>

                       {draft.businessSpec?.meta?.languageMode !== 'multilingual' ? (
                          <div>
                              <select 
                                  className="input-field max-w-sm w-full"
                                  value={draft.businessSpec?.meta?.primaryLanguage || draft.businessSpec?.meta?.languageMode || 'english'}
                                  onChange={(e) => {
                                      const newDraft = { ...draft };
                                      if (newDraft.businessSpec) {
                                          newDraft.businessSpec.meta.primaryLanguage = e.target.value;
                                          newDraft.businessSpec.meta.languageMode = e.target.value as any;
                                      }
                                      onChangeDraft(newDraft);
                                  }}
                              >
                                  <option value="english">English</option>
                                  <option value="hindi">Hindi</option>
                                  <option value="hinglish">Hinglish</option>
                                  <option value="spanish">Spanish</option>
                                  <option value="french">French</option>
                                  <option value="german">German</option>
                                  <option value="arabic">Arabic</option>
                                  <option value="portuguese">Portuguese</option>
                              </select>
                              <p className="text-[12px] text-graphite mt-1.5">The primary language the agent will speak.</p>
                          </div>
                       ) : (
                          <div className="flex flex-col sm:flex-row gap-4 max-w-md">
                             <div className="flex-1">
                               <label className="block text-[12px] font-medium text-ink mb-1.5">Primary</label>
                               <select 
                                  className="input-field w-full" 
                                  value={draft.businessSpec?.meta?.primaryLanguage || 'english'}
                                  onChange={(e) => {
                                     const newDraft = { ...draft };
                                     if (newDraft.businessSpec) {
                                       newDraft.businessSpec.meta.primaryLanguage = e.target.value;
                                     }
                                     onChangeDraft(newDraft);
                                  }}
                               >
                                  <option value="english">English</option>
                                  <option value="hindi">Hindi</option>
                                  <option value="hinglish">Hinglish</option>
                                  <option value="spanish">Spanish</option>
                                  <option value="french">French</option>
                                  <option value="german">German</option>
                                  <option value="arabic">Arabic</option>
                                  <option value="portuguese">Portuguese</option>
                               </select>
                             </div>
                             <div className="flex-1">
                               <label className="block text-[12px] font-medium text-ink mb-1.5">Secondary</label>
                               <select 
                                  className="input-field w-full" 
                                  value={draft.businessSpec?.meta?.secondaryLanguage || 'spanish'}
                                  onChange={(e) => {
                                     const newDraft = { ...draft };
                                     if (newDraft.businessSpec) {
                                       newDraft.businessSpec.meta.secondaryLanguage = e.target.value;
                                     }
                                     onChangeDraft(newDraft);
                                  }}
                               >
                                  <option value="english">English</option>
                                  <option value="hindi">Hindi</option>
                                  <option value="hinglish">Hinglish</option>
                                  <option value="spanish">Spanish</option>
                                  <option value="french">French</option>
                                  <option value="german">German</option>
                                  <option value="arabic">Arabic</option>
                                  <option value="portuguese">Portuguese</option>
                               </select>
                             </div>
                          </div>
                       )}
                     </div>
                     <div>
                       <label className="block text-[13px] font-medium text-ink mb-1.5">Primary Goal</label>
                       <textarea 
                         className="input-field w-full resize-none overflow-hidden min-h-[40px]" 
                         rows={1}
                         value={draft.businessSpec?.meta?.primaryGoal || ''}
                         onChange={(e) => {
                            e.target.style.height = 'auto';
                            e.target.style.height = `${e.target.scrollHeight}px`;
                            const newDraft = { ...draft };
                            if (newDraft.businessSpec) {
                              newDraft.businessSpec.meta.primaryGoal = e.target.value;
                            }
                            onChangeDraft(newDraft);
                         }}
                         ref={(el) => {
                           if (el) {
                             el.style.height = 'auto';
                             el.style.height = `${el.scrollHeight}px`;
                           }
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
                  <div className="flex flex-col gap-3 mb-4">
                     {(draft.suggestedFunctions || []).map((t, i) => (
                        <div key={i} className="flex items-stretch border border-line rounded-lg bg-white shadow-sm overflow-hidden hover:border-line-strong transition-colors">
                           <div className="w-[260px] shrink-0 p-3 flex items-center bg-canvas/40 border-r border-line">
                              <ToolChip name={t.name} />
                           </div>
                           <div className="flex-1 p-3.5 flex items-center">
                              <p className="text-[13px] text-ink-soft leading-relaxed m-0">
                                 {t.description || "No description provided."}
                              </p>
                           </div>
                        </div>
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
                  <p className="text-[13px] text-graphite mb-6">Variables injected into the prompt before the call.</p>
                  <div>
                     {infieldVariables.map((v, i) => (
                        <CompactRow key={i} onRemove={() => {
                           const newVars = draft.dynamicVariables?.filter(dv => dv.key !== v.key) || [];
                           onChangeDraft({ ...draft, dynamicVariables: newVars });
                        }}>
                           <div className="flex items-center justify-between">
                              <div>
                                 <div className="text-[13px] font-medium text-ink font-mono">{v.key}</div>
                                 <div className="text-[12px] text-graphite">{v.description || 'No description'}</div>
                              </div>
                              <div className="text-[11px] uppercase tracking-wider text-faint border border-line rounded px-1.5 py-0.5">
                                 Injected
                              </div>
                           </div>
                        </CompactRow>
                     ))}
                     {infieldVariables.length === 0 && (
                        <p className="text-[13px] text-faint italic">No injected variables defined.</p>
                     )}
                  </div>
               </div>
             )}

             {activeTab === 'outcomes' && (
               <div className="card p-6 overflow-y-auto animate-fade-in-up">
                  <h2 className="text-[16px] font-semibold text-ink mb-2">Call Outcomes</h2>
                  <p className="text-[13px] text-graphite mb-6">Variables and data extracted after the call.</p>
                  <div>
                     {outfieldVariables.map((v, i) => (
                        <CompactRow key={i} onRemove={() => {
                           const newVars = draft.dynamicVariables?.filter(dv => dv.key !== v.key) || [];
                           onChangeDraft({ ...draft, dynamicVariables: newVars });
                        }}>
                           <div className="flex items-center justify-between">
                              <div>
                                 <div className="text-[13px] font-medium text-ink font-mono">{v.key}</div>
                                 <div className="text-[12px] text-graphite">{v.description || 'No description'}</div>
                              </div>
                              <div className="text-[11px] uppercase tracking-wider text-faint border border-line rounded px-1.5 py-0.5">
                                 Extracted
                              </div>
                           </div>
                        </CompactRow>
                     ))}
                     {outfieldVariables.length === 0 && (
                        <p className="text-[13px] text-faint italic">No extracted outcomes defined.</p>
                     )}
                  </div>
               </div>
             )}
          </div>
       </div>
    </div>
    </div>
  );
};
