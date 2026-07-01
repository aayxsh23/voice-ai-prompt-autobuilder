'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, User, Send, CheckCircle2, ArrowRight, Layers, ShieldAlert, Sliders, Play } from 'lucide-react';
import { PromptPackageDraft, BusinessSnapshot, CallMission, ConversationDesign, VoicePersonality, SchemaOverrides } from '@/lib/llm/types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function ChatbotBuilderPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  
  // Chat state
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hello! I'm your VoiceAgent Architect. What kind of AI voice agent would you like to build today? Tell me about your domain and what workflows you want it to handle."
    }
  ]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [missingDetails, setMissingDetails] = useState<string[]>([
    'request_types', 'caller_segmentation', 'operational_context', 'data_collection',
    'escalation_triggers', 'forbidden_actions', 'faq_content', 'post_call_action'
  ]);

  const CATEGORY_LABELS: Record<string, string> = {
    request_types: 'Request Types & Sub-flows',
    caller_segmentation: 'Caller Segmentation',
    operational_context: 'Operational Context',
    data_collection: 'Data Collection Slots',
    escalation_triggers: 'Escalation & Transfer',
    forbidden_actions: 'Forbidden Actions',
    faq_content: 'FAQ Content',
    post_call_action: 'Post-Call Outcome'
  };
  
  // Blueprint state gathered during chat
  const [blueprint, setBlueprint] = useState<any>({
    useCase: 'Custom Voice Agent',
    business: { businessName: 'My Enterprise', industry: 'General', description: '' },
    mission: { primaryGoal: 'Assist callers', supportedIntents: [] },
    conversation: { opening: 'Hello, how can I help you today?' },
    personality: { tone: 'Warm, empathetic, professional' }
  });

  // Prompt generation state
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [draft, setDraft] = useState<PromptPackageDraft | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const [activeTab, setActiveTab] = useState<'agent' | 'system' | 'combined'>('agent');
  const [overrides, setOverrides] = useState<SchemaOverrides>({
    faqPairs: [],
    objectionPairs: [],
    verbatimLines: [],
    transferRules: []
  });
  const [isOverridePanelOpen, setIsOverridePanelOpen] = useState(false);
  const [activeOverrideTab, setActiveOverrideTab] = useState<'faq' | 'transfer' | 'verbatim'>('faq');

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const initialPromptHandledRef = useRef(false);

  const handleInputResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  useEffect(() => {
    params.then(p => {
      setSessionId(p.sessionId);
      setLoading(false);
      if (typeof window !== 'undefined' && !initialPromptHandledRef.current) {
        const urlParams = new URLSearchParams(window.location.search);
        const initPrompt = urlParams.get('initialPrompt');
        if (initPrompt) {
          initialPromptHandledRef.current = true;
          window.history.replaceState({}, '', `/builder/${p.sessionId}`);
          setTimeout(() => {
            handleSendMessage(undefined, initPrompt);
          }, 100);
        }
      }
    });
  }, [params]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatLoading]);

  const handleSendMessage = async (e?: React.FormEvent, customMsg?: string) => {
    if (e) e.preventDefault();
    const textToSend = customMsg || input;
    if (!textToSend.trim() || chatLoading) return;

    const newMessages: Message[] = [...messages, { role: 'user', content: textToSend }];
    setMessages(newMessages);
    if (!customMsg) {
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }
    setChatLoading(true);

    try {
      const res = await fetch('/api/builder/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, currentBlueprint: blueprint })
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to get response from builder API");
      }
      if (data) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply || "Thank you for sharing those details! To ensure our prompt is highly detailed and thorough, what exact checklist items or caller details should the agent collect, and what are a couple of common FAQs callers ask?" }]);
        if (data.isReadyToGenerate !== undefined) setIsReady(data.isReadyToGenerate);
        if (data.missingDetails) setMissingDetails(data.missingDetails);
        
        let mergedBlueprint = { ...blueprint };
        let mergedOverrides = { ...overrides };
        if (data.extractedBlueprint) {
          mergedBlueprint = {
            ...blueprint,
            ...data.extractedBlueprint,
            business: { ...blueprint.business, ...(data.extractedBlueprint.business || {}) },
            mission: { ...blueprint.mission, ...(data.extractedBlueprint.mission || {}) },
            conversation: { ...blueprint.conversation, ...(data.extractedBlueprint.conversation || {}) }
          };
          setBlueprint(mergedBlueprint);
          if (data.extractedBlueprint.overrides) {
            mergedOverrides = {
              ...overrides,
              ...(data.extractedBlueprint.overrides || {})
            };
            setOverrides(mergedOverrides);
          }
        }

        const userAgreed = /\b(yes|yeah|yep|generate|go ahead|ready|ok|okay|sure|let'?s do it|build|looks good|agree|proceed|create|split|finalize|done)\b/i.test(input.trim());
        if (data.triggerGeneration || ((isReady || data.isReadyToGenerate) && userAgreed)) {
          setTimeout(() => {
            handleGeneratePromptPackage(mergedBlueprint, mergedOverrides);
          }, 300);
        }
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'assistant', content: "I encountered a minor issue connecting. Could you please clarify what details callers should provide?" }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleGeneratePromptPackage = async (customBlueprint?: any, customOverrides?: any) => {
    setGeneratingDraft(true);
    try {
      const payload = {
        ...(customBlueprint || blueprint),
        overrides: customOverrides || overrides
      };
      const res = await fetch('/api/builder/generate-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data) {
        setDraft(data);
      }
    } catch (err) {
      alert('Failed to generate prompt draft. Please try again.');
    } finally {
      setGeneratingDraft(false);
    }
  };

  const handleCreateProject = async () => {
    setCreatingProject(true);
    try {
      const res = await fetch('/api/builder/create-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          draft,
          blueprint
        })
      });
      const project = await res.json();
      if (project && project.id) {
        router.push(`/project/${project.id}`);
      } else {
        alert('Error saving project.');
        setCreatingProject(false);
      }
    } catch (err) {
      alert('Failed to save project workspace.');
      setCreatingProject(false);
    }
  };

  if (loading) return <div className="min-h-[80vh] bg-[#040404] flex items-center justify-center text-[#909090] text-sm">Initializing session...</div>;

  return (
    <div className="flex-1 bg-[#040404] text-[#f3f3f3] flex flex-col font-sans selection:bg-[#ff6c02] selection:text-[#040404]">
      {/* Main Studio Area */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-hidden">
        
        {/* Chat Conversation Column */}
        {messages.length === 1 && !chatLoading ? (
          /* Centered Starting Screen */
          <div className="col-span-1 lg:col-span-3 flex flex-col items-center justify-center p-6 min-h-[75vh]">
            <div className="space-y-6 w-full max-w-3xl text-center">
              <h1 className="text-[32px] sm:text-[42px] font-semibold text-[#f3f3f3] tracking-tight leading-[1.15]">
                What kind of Voice AI agent are we building today?
              </h1>
              <p className="text-[15px] text-[#909090] max-w-xl mx-auto leading-relaxed">
                Describe your business workflows, required caller checklist, FAQ answers, and transfer rules. Watch our AI architect a production-grade prompt package.
              </p>

              {/* Dynamic Auto-Expanding Input Bar */}
              <div className="mt-8 text-left">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="w-full bg-[#0c0c0c] border border-[#252525] rounded-[16px] p-2 sm:p-3 focus-within:border-[#ff6c02] transition-colors shadow-2xl flex items-center gap-2"
                >
                  <textarea
                    ref={textareaRef}
                    rows={2}
                    value={input}
                    onChange={handleInputResize}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder="Describe your voice agent (e.g. Dental clinic receptionist handling appointments, FAQs, and emergency transfers)..."
                    disabled={chatLoading}
                    className="flex-1 bg-transparent border-none px-3 py-2 text-[15px] text-[#f3f3f3] placeholder-[#646464] focus:outline-none resize-none overflow-hidden leading-relaxed"
                  />
                  <button
                    type="submit"
                    disabled={chatLoading || !input.trim()}
                    className="bg-[#ff6c02] hover:bg-[#ff8025] disabled:opacity-40 text-[#040404] font-semibold w-10 h-10 rounded-[10px] flex items-center justify-center transition-colors cursor-pointer shrink-0 mr-0.5"
                  >
                    {chatLoading ? (
                      <div className="w-4 h-4 rounded-full border-2 border-[#040404] border-t-transparent animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </form>
              </div>
            </div>
          </div>
        ) : (
          <div className={`flex flex-col bg-[#0c0c0c] border border-[#252525] rounded-[12px] overflow-hidden transition-all duration-300 ${(draft || generatingDraft) ? 'lg:col-span-1' : 'lg:col-span-3'}`}>
            {/* Messages Log */}
            <div className="flex-1 p-5 overflow-y-auto space-y-4 max-h-[650px] min-h-[450px]">
              {messages.map((m, idx) => (
                <div key={idx} className={`flex items-start gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${m.role === 'user' ? 'bg-[#1b1b1b] border border-[#303030] text-[#f3f3f3]' : 'bg-[#ff6c02] text-[#040404]'}`}>
                    {m.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                  </div>
                  <div className={`max-w-[82%] rounded-[12px] px-4 py-3 text-[14px] leading-relaxed border ${m.role === 'user' ? 'bg-[#1b1b1b] border-[#303030] text-[#f3f3f3]' : 'bg-[#121212] border-[#252525] text-[#dedede]'}`}>
                    {m.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex items-center gap-3 text-[#909090] text-xs py-2">
                  <div className="w-7 h-7 rounded-full bg-[#121212] border border-[#252525] flex items-center justify-center animate-pulse shrink-0">
                    <Bot className="w-3.5 h-3.5 text-[#ff6c02]" />
                  </div>
                  <span className="animate-pulse">Thinking...</span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Discovery Progress Bar */}
            <div className="px-4 py-2 bg-[#121212] border-t border-[#252525] flex items-center justify-between text-xs text-[#909090]">
              <div className="flex items-center gap-2">
                <span className="font-medium text-[#dedede]">Discovery Progress:</span>
                <span>{8 - Math.min(missingDetails.length, 8)}/8 Categories Gathered</span>
              </div>
              {missingDetails.length > 0 && (
                <div className="hidden sm:flex items-center gap-1.5 overflow-x-auto max-w-[280px]">
                  <span className="text-[#ff6c02] shrink-0">Next:</span>
                  <span className="truncate text-[#dedede]">{CATEGORY_LABELS[missingDetails[0]] || missingDetails[0]}</span>
                </div>
              )}
            </div>

            {/* Dynamic Input Box for Ongoing Chat */}
            <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="p-3 bg-[#0c0c0c] border-t border-[#252525] flex flex-col gap-2">
              <div className="flex items-center gap-2 bg-[#1b1b1b] border border-[#252525] focus-within:border-[#ff6c02] rounded-[8px] p-2 transition-colors">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={input}
                  onChange={handleInputResize}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Type your answer or instruction..."
                  disabled={chatLoading}
                  className="flex-1 bg-transparent border-none px-2 py-1 text-sm text-[#f3f3f3] placeholder-[#646464] focus:outline-none resize-none overflow-hidden leading-relaxed"
                />
                <button
                  type="submit"
                  disabled={chatLoading || !input.trim()}
                  className="bg-[#ff6c02] hover:bg-[#ff8025] disabled:opacity-50 text-[#040404] px-3 py-2 rounded-[4px] flex items-center justify-center transition-colors cursor-pointer shrink-0 font-medium"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Output Column (Visible when generating or generated) */}
        {(draft || generatingDraft) && (
          <div className="flex flex-col gap-6 lg:col-span-2">
            {generatingDraft && !draft ? (
              /* Loading Window */
              <div className="bg-[#0c0c0c] border border-[#252525] rounded-[12px] flex flex-col h-full min-h-[500px] overflow-hidden">
                <div className="bg-[#121212] px-4 py-3 border-b border-[#252525] flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-[#ff6c02] animate-ping" />
                  <span className="text-xs font-medium text-[#dedede]">Prompt Studio Preview</span>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
                  <div className="w-8 h-8 rounded-full border-2 border-[#ff6c02] border-t-transparent animate-spin" />
                  <h3 className="text-base font-semibold text-[#f3f3f3]">Compiling Prompt Package...</h3>
                  <p className="text-sm text-[#909090] max-w-md">Splitting your requirements into distinct Agent Persona tabs and strict System rules.</p>
                </div>
              </div>
            ) : draft ? (
            /* Split Prompts Studio Window */
            <div className="bg-[#0c0c0c] border border-[#252525] rounded-[12px] flex flex-col h-full overflow-hidden">
              {/* Top Title Bar */}
              <div className="bg-[#121212] px-4 pt-3 pb-2 border-b border-[#252525] flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-[#ff6c02]" />
                  <span className="text-xs font-semibold text-[#f3f3f3] flex items-center gap-1.5">
                    Split Prompts Studio
                  </span>
                </div>

                <button
                  onClick={handleCreateProject}
                  disabled={creatingProject}
                  className="px-4 py-1.5 rounded-[4px] bg-[#ff6c02] hover:bg-[#ff8025] text-[#f3f3f3] font-medium text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  {creatingProject ? 'Saving...' : 'Finalize Workspace'}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Tabs Bar */}
              <div className="bg-[#121212] px-3 pt-2 border-b border-[#252525] flex items-center gap-1 overflow-x-auto">
                <button
                  onClick={() => setActiveTab('agent')}
                  className={`px-4 py-2 rounded-t-[8px] text-xs font-medium transition-colors flex items-center gap-2 border-t border-x cursor-pointer ${activeTab === 'agent' ? 'bg-[#0c0c0c] text-[#f3f3f3] border-[#252525] border-b-[#0c0c0c] -mb-[1px]' : 'bg-transparent text-[#909090] border-transparent hover:bg-[#1b1b1b] hover:text-[#f3f3f3]'}`}
                >
                  <span>Agent Prompt.tab</span>
                  {activeTab === 'agent' && <span className="w-1.5 h-1.5 rounded-full bg-[#ff6c02]" />}
                </button>
                <button
                  onClick={() => setActiveTab('system')}
                  className={`px-4 py-2 rounded-t-[8px] text-xs font-medium transition-colors flex items-center gap-2 border-t border-x cursor-pointer ${activeTab === 'system' ? 'bg-[#0c0c0c] text-[#f3f3f3] border-[#252525] border-b-[#0c0c0c] -mb-[1px]' : 'bg-transparent text-[#909090] border-transparent hover:bg-[#1b1b1b] hover:text-[#f3f3f3]'}`}
                >
                  <span>System Prompt.tab</span>
                  {activeTab === 'system' && <span className="w-1.5 h-1.5 rounded-full bg-[#ff6c02]" />}
                </button>
                <button
                  onClick={() => setActiveTab('combined')}
                  className={`px-4 py-2 rounded-t-[8px] text-xs font-medium transition-colors flex items-center gap-2 border-t border-x cursor-pointer ${activeTab === 'combined' ? 'bg-[#0c0c0c] text-[#f3f3f3] border-[#252525] border-b-[#0c0c0c] -mb-[1px]' : 'bg-transparent text-[#909090] border-transparent hover:bg-[#1b1b1b] hover:text-[#f3f3f3]'}`}
                >
                  <span>Combined Final.tab</span>
                  {activeTab === 'combined' && <span className="w-1.5 h-1.5 rounded-full bg-[#ff6c02]" />}
                </button>
              </div>

              {/* Human Review Warning Banner */}
              {(draft.requiresHumanReview || (draft.validationErrors && draft.validationErrors.length > 0)) && (
                <div className="bg-[#ff3333]/15 border-b border-[#ff3333]/40 px-4 py-3 flex items-start gap-3">
                  <ShieldAlert className="w-4 h-4 text-[#ff5555] shrink-0 mt-0.5" />
                  <div className="text-xs text-[#ffdede]">
                    <span className="font-semibold text-[#ff5555]">Validation Warning / Human Review Suggested:</span> Automated compiler loop flagged potential structure issues after retries:
                    <ul className="list-disc ml-4 mt-1 space-y-0.5 text-[#ffb8b8]">
                      {(draft.validationErrors || ['Quality/Security check warning']).slice(0, 3).map((e, idx) => (
                        <li key={idx}>{e}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Tab Content Window */}
              <div className="p-5 flex-1 flex flex-col gap-4 bg-[#0c0c0c]">
                <div className="flex-1 bg-[#040404] border border-[#252525] rounded-[8px] p-4 font-mono text-xs text-[#dedede] overflow-y-auto max-h-[500px] whitespace-pre-wrap leading-relaxed selection:bg-[#ff6c02] selection:text-[#040404]">
                  {activeTab === 'agent' && draft.finalPrompt}
                  {activeTab === 'system' && draft.finalPrompt}
                  {activeTab === 'combined' && draft.finalPrompt}
                </div>

                {/* Tool Registry Badge List */}
                {draft.suggestedFunctions && draft.suggestedFunctions.length > 0 && (
                  <div className="pt-3 border-t border-[#252525]">
                    <span className="text-xs font-medium text-[#909090] block mb-2">Embedded Tools Registered:</span>
                    <div className="flex flex-wrap gap-2">
                      {draft.suggestedFunctions.map((f, i) => (
                        <span key={i} className="inline-flex items-center gap-1.5 text-xs bg-transparent text-[#55c2ff] border border-[#55c2ff]/40 px-3 py-1 rounded-full font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#55c2ff]" />
                          {f.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}

        </div>
        )}

      </div>
    </div>
  );
}
