import React, { useState } from 'react';
import { PromptPackageDraft } from '@/lib/llm/types';
import { SidebarGroup, SidebarLink, ToolChip, CompactRow } from './EditorComponents';
import { FileText, Settings, Wrench, Variable, Check, Copy, ArrowRight, Loader2, ArrowLeft, AlertTriangle, UserCircle, ListTree, Brain, Shield, Zap, ChevronDown, ChevronRight, Activity, Phone, Send } from 'lucide-react';
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
  const [openPromptSection, setOpenPromptSection] = useState('identity');
  const promptSectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const jumpToPromptSection = (key: string) => {
      setOpenPromptSection(key);
      setTimeout(() => {
          const el = promptSectionRefs.current[key];
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
  };

  const parsePromptSections = (prompt: string) => {
    const sections = { identity: '', flow: '', knowledge: '', guardrails: '', escalation: '' };
    if (!prompt) return sections;
    
    // Split by ### headers
    const parts = prompt.split(/(?=### )/g);
    parts.forEach(part => {
      if (part.includes('AGENT IDENTITY')) sections.identity += part;
      else if (part.includes('STATE MACHINE')) sections.flow += part;
      else if (part.includes('BUSINESS CONTEXT') || part.includes('FAQ')) sections.knowledge += part;
      else if (part.includes('SCOPE & BOUNDARIES')) sections.guardrails += part;
      else if (part.includes('ESCALATION & ROUTING')) sections.escalation += part;
      else sections.identity += part; // fallback
    });
    return sections;
  };

  const parsedPrompt = parsePromptSections(draft.finalPrompt || '');

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
                                </div>
                            </div>
                        </div>

                        <div>
                            <span className="block text-[11px] font-semibold text-graphite/70 uppercase tracking-wider mb-2">Prompt Sections</span>
                            
                            {mode !== 'scratch' && (
                                <div className="sticky top-0 z-10 -mx-1 px-1 py-2 bg-canvas/95 backdrop-blur">
                                    <div className="flex items-center gap-2 overflow-x-auto">
                                        {[
                                            { key: 'identity', title: 'Identity & Voice', icon: UserCircle },
                                            { key: 'flow', title: 'Call Flow', icon: ListTree },
                                            { key: 'knowledge', title: 'Knowledge Base', icon: Brain },
                                            { key: 'guardrails', title: 'Guardrails & Safety', icon: Shield },
                                            { key: 'escalation', title: 'Escalation & Tools', icon: Zap }
                                        ].map(section => (
                                            <button
                                                key={section.key}
                                                type="button"
                                                onClick={() => jumpToPromptSection(section.key)}
                                                className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium border transition-colors ${openPromptSection === section.key ? 'bg-accent text-white border-accent' : 'bg-white text-graphite border-line hover:border-line-strong hover:text-ink'}`}
                                            >
                                                <section.icon className="w-3.5 h-3.5" /> {section.title}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

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
                            <div className="space-y-3">
                                {[
                                    { key: 'identity', title: 'Identity & Voice', subtitle: 'Who the agent is, its persona, tone, and voice mechanics.', icon: UserCircle, color: 'text-accent', bg: 'bg-accent-soft' },
                                    { key: 'flow', title: 'Call Flow', subtitle: 'The state machine and dynamic variables the agent follows.', icon: ListTree, color: 'text-accent', bg: 'bg-accent-soft' },
                                    { key: 'knowledge', title: 'Knowledge Base', subtitle: 'Business facts, FAQs, and objection handling.', icon: Brain, color: 'text-accent', bg: 'bg-accent-soft' },
                                    { key: 'guardrails', title: 'Guardrails & Safety', subtitle: 'Scope boundaries, fallbacks, and global interrupts.', icon: Shield, color: 'text-accent', bg: 'bg-accent-soft' },
                                    { key: 'escalation', title: 'Escalation & Tools', subtitle: 'Transfer routing and the tool contract.', icon: Zap, color: 'text-accent', bg: 'bg-accent-soft' }
                                ].map(section => {
                                    const isOpen = openPromptSection === section.key;
                                    const Icon = section.icon;
                                    // @ts-ignore
                                    const sectionContent = parsedPrompt[section.key];
                                    if (!sectionContent?.trim()) return null;

                                    return (
                                        <div key={section.key} ref={(el) => { promptSectionRefs.current[section.key] = el; }} className="card bg-white shadow-sm overflow-hidden scroll-mt-16">
                                            <button
                                                type="button"
                                                onClick={() => setOpenPromptSection(isOpen ? '' : section.key)}
                                                className="w-full flex items-center gap-3 p-4 text-left hover:bg-subtle/60 transition-colors"
                                            >
                                                <span className={`inline-flex items-center justify-center w-8 h-8 rounded-md shrink-0 ${isOpen ? 'bg-accent-soft text-accent' : 'bg-subtle text-graphite'}`}>
                                                    <Icon className="w-4 h-4" />
                                                </span>
                                                <span className="flex-1 min-w-0">
                                                    <span className="block text-[14px] font-semibold text-ink">{section.title}</span>
                                                    <span className="block text-[12px] text-graphite truncate">{isOpen ? section.subtitle : (sectionContent.slice(0, 100).replace(/\n/g, ' '))}</span>
                                                </span>
                                                <ChevronDown className={`w-4 h-4 text-graphite shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                            </button>
                                            
                                            {isOpen && (
                                                <div className="px-4 pb-4 animate-fade-in">
                                                    <div className="relative">
                                                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-accent rounded-l"></div>
                                                        <textarea
                                                            value={sectionContent}
                                                            onChange={(e) => {
                                                                const updatedSections = { ...parsedPrompt, [section.key]: e.target.value };
                                                                const newPrompt = Object.values(updatedSections).filter(Boolean).join('\n\n');
                                                                handlePromptChange(newPrompt);
                                                            }}
                                                            spellCheck={false}
                                                            className="w-full h-[300px] resize-y font-mono text-[13px] leading-relaxed focus:border-accent focus:ring-1 focus:ring-accent-soft pl-4 bg-canvas/30 text-ink-soft outline-none border border-line rounded-md py-3"
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        </div>
                    </div>
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
