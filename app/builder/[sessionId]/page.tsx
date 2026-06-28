'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, User, Send, Sparkles, CheckCircle2, ArrowRight, Layers, ShieldAlert, Sliders, Play } from 'lucide-react';
import { PromptPackageDraft, BusinessSnapshot, CallMission, ConversationDesign, VoicePersonality } from '@/lib/llm/types';

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
      content: "Hello! I am your AutoPrompt AI Architect. What kind of AI voice agent would you like to build today? Tell me about your business and what tasks you want the voice agent to handle."
    }
  ]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [missingDetails, setMissingDetails] = useState<string[]>(['Supported intents', 'Required caller fields', 'Objection handling']);
  
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

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    params.then(p => {
      setSessionId(p.sessionId);
      setLoading(false);
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
    if (!customMsg) setInput('');
    setChatLoading(true);

    try {
      const res = await fetch('/api/builder/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, currentBlueprint: blueprint })
      });
      const data = await res.json();
      if (data) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply || "Got it. Tell me a bit more about how you'd like the agent to respond." }]);
        if (data.isReadyToGenerate !== undefined) setIsReady(data.isReadyToGenerate);
        if (data.missingDetails) setMissingDetails(data.missingDetails);
        if (data.extractedBlueprint) {
          setBlueprint((prev: any) => ({
            ...prev,
            ...data.extractedBlueprint,
            business: { ...prev.business, ...(data.extractedBlueprint.business || {}) },
            mission: { ...prev.mission, ...(data.extractedBlueprint.mission || {}) }
          }));
        }
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'assistant', content: "I encountered a minor issue connecting. Could you please clarify what details callers should provide?" }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleGeneratePromptPackage = async () => {
    setGeneratingDraft(true);
    try {
      const res = await fetch('/api/builder/generate-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(blueprint)
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

  if (loading) return <div className="min-h-screen bg-[#0f1117] flex items-center justify-center text-slate-400">Initializing Architect Studio...</div>;

  return (
    <div className="min-h-screen bg-[#0f1117] text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-[#161822]/80 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Sparkles className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              AutoPrompt AI Architect
            </h1>
            <p className="text-xs text-slate-400">Conversational Prompt Studio & State Machine Splitter</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isReady && !draft && (
            <button
              onClick={handleGeneratePromptPackage}
              disabled={generatingDraft}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-medium text-sm transition-all duration-200 shadow-lg shadow-emerald-500/20 animate-bounce"
            >
              <Play className="w-4 h-4 fill-current" />
              {generatingDraft ? 'Generating Split Prompts...' : 'Generate Split Prompt Package'}
            </button>
          )}
          {!isReady && !draft && (
            <button
              onClick={handleGeneratePromptPackage}
              disabled={generatingDraft}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 font-medium text-sm transition-all border border-indigo-500/30"
            >
              <Sparkles className="w-4 h-4" />
              {generatingDraft ? 'Generating...' : 'Force Generate Now'}
            </button>
          )}
        </div>
      </header>

      {/* Main Studio Area */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-hidden">
        
        {/* Chat Conversation Column (2 Cols on desktop when building) */}
        <div className={`flex flex-col bg-[#161822] border border-slate-800/80 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 ${draft ? 'lg:col-span-1' : 'lg:col-span-2'}`}>
          <div className="bg-slate-900/60 border-b border-slate-800 px-4 py-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Bot className="w-4 h-4 text-indigo-400" /> Requirement Discovery Chat
            </span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">
              Live Session
            </span>
          </div>

          {/* Messages Log */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4 max-h-[600px] min-h-[400px]">
            {messages.map((m, idx) => (
              <div key={idx} className={`flex items-start gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-gradient-to-tr from-indigo-500 to-cyan-500 text-white shadow-md shadow-indigo-500/20'}`}>
                  {m.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${m.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-slate-800/80 border border-slate-700/50 text-slate-200 rounded-tl-none backdrop-blur-sm'}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex items-center gap-3 text-slate-400 text-xs italic py-2">
                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center animate-pulse shrink-0">
                  <Bot className="w-4 h-4 text-indigo-400" />
                </div>
                <span className="animate-pulse">Architect is analyzing your requirements...</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick Starter Suggestions */}
          {messages.length === 1 && (
            <div className="px-4 py-2 bg-slate-900/40 border-t border-slate-800 flex flex-wrap gap-2 items-center">
              <span className="text-xs text-slate-400 font-medium mr-1">Suggestions:</span>
              {[
                "Dental reception booking & FAQ agent",
                "Real estate inbound lead qualification",
                "IT helpdesk ticket dispatcher"
              ].map((sug, i) => (
                <button
                  key={i}
                  onClick={() => handleSendMessage(undefined, sug)}
                  className="text-xs bg-slate-800 hover:bg-indigo-600/30 hover:border-indigo-500/50 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700 transition-all"
                >
                  {sug}
                </button>
              ))}
            </div>
          )}

          {/* Input Box */}
          <form onSubmit={handleSendMessage} className="p-3 bg-slate-900/80 border-t border-slate-800 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Type your answer or instruction..."
              disabled={chatLoading}
              className="flex-1 bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-all"
            />
            <button
              type="submit"
              disabled={chatLoading || !input.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white p-2.5 rounded-xl flex items-center justify-center transition-all shadow-lg shadow-indigo-600/20 shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* Status / Output Column */}
        <div className={`flex flex-col gap-6 ${draft ? 'lg:col-span-2' : 'lg:col-span-1'}`}>
          
          {!draft ? (
            /* Requirement Tracker & Blueprint Summary */
            <div className="bg-[#161822] border border-slate-800/80 rounded-2xl p-5 shadow-2xl flex flex-col gap-5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-semibold text-sm text-slate-200 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-cyan-400" /> Blueprint Tracker
                </h3>
                {isReady ? (
                  <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Ready for Generation
                  </span>
                ) : (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                    Gathering Details
                  </span>
                )}
              </div>

              {/* Missing Details Checklist */}
              <div>
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block mb-2">Required Checklist</span>
                <div className="space-y-2">
                  {missingDetails.length === 0 ? (
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      All core requirements captured! You can generate your split prompt now.
                    </div>
                  ) : (
                    missingDetails.map((req, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs text-slate-300 bg-slate-900/50 px-3 py-2 rounded-lg border border-slate-800">
                        <div className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                        <span>Need clarification: <strong className="text-white">{req}</strong></span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Architecture Info Box */}
              <div className="bg-gradient-to-br from-indigo-950/40 to-slate-900/60 rounded-xl p-4 border border-indigo-500/20 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-indigo-300">
                  <Layers className="w-4 h-4" /> Split Architecture Engine
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Your prompt will automatically be compiled into two strict layers:
                </p>
                <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
                  <li><strong className="text-slate-200">Agent Prompt:</strong> Editable identity, flow & variable configuration.</li>
                  <li><strong className="text-slate-200">System Prompt:</strong> Hard gates, pre-turn check & tool definitions (<code className="text-cyan-300">end_call</code>, <code className="text-cyan-300">validate_digit_input</code>).</li>
                </ul>
              </div>

              <div className="pt-2">
                <button
                  onClick={handleGeneratePromptPackage}
                  disabled={generatingDraft}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-semibold text-sm transition-all shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  {generatingDraft ? 'Compiling Split Package...' : 'Generate Split Prompt Package'}
                </button>
              </div>
            </div>
          ) : (
            /* Prompt Package Preview Tabs */
            <div className="bg-[#161822] border border-slate-800/80 rounded-2xl p-5 shadow-2xl flex flex-col gap-4 h-full">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="font-bold text-base text-white flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" /> Generated Split Prompt Package
                  </h3>
                  <p className="text-xs text-slate-400">Review your separated Agent and System instructions below.</p>
                </div>
                <button
                  onClick={handleCreateProject}
                  disabled={creatingProject}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-all shadow-lg shadow-emerald-600/25 flex items-center gap-2"
                >
                  {creatingProject ? 'Saving...' : 'Finalize & Open Workspace'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 self-start">
                <button
                  onClick={() => setActiveTab('agent')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${activeTab === 'agent' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                >
                  <User className="w-3.5 h-3.5" /> Agent Prompt (User Editable)
                </button>
                <button
                  onClick={() => setActiveTab('system')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${activeTab === 'system' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                >
                  <ShieldAlert className="w-3.5 h-3.5" /> System Prompt (Hard Rules)
                </button>
                <button
                  onClick={() => setActiveTab('combined')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${activeTab === 'combined' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                >
                  <Layers className="w-3.5 h-3.5" /> Combined Final Prompt
                </button>
              </div>

              {/* Tab Content */}
              <div className="flex-1 bg-slate-950/80 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-300 overflow-y-auto max-h-[500px] whitespace-pre-wrap leading-relaxed selection:bg-indigo-500 selection:text-white">
                {activeTab === 'agent' && draft.agentPrompt}
                {activeTab === 'system' && draft.systemPrompt}
                {activeTab === 'combined' && `${draft.agentPrompt}\n\n${draft.systemPrompt}`}
              </div>

              {/* Tool Registry Badge List */}
              <div className="pt-2 border-t border-slate-800/80">
                <span className="text-xs font-semibold text-slate-400 block mb-2">Embedded Tools & Handlers Registered:</span>
                <div className="flex flex-wrap gap-2">
                  {draft.suggestedFunctions?.map((f, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 text-xs bg-indigo-950/60 text-indigo-300 border border-indigo-500/30 px-3 py-1 rounded-lg font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                      {f.name}
                    </span>
                  ))}
                </div>
              </div>

            </div>
          )}

        </div>

      </div>
    </div>
  );
}
