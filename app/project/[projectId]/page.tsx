'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui';
import { PromptSettingsSidebar } from '@/components/project/PromptSettingsSidebar';
import { AgentPromptEditor } from '@/components/project/AgentPromptEditor';
import { SystemPromptEditor } from '@/components/project/SystemPromptEditor';
import { QualityScoreCard } from '@/components/project/QualityScoreCard';
import { DynamicVariablesTable } from '@/components/project/DynamicVariablesTable';
import { SuggestedFunctionsPanel } from '@/components/project/SuggestedFunctionsPanel';
import { KnowledgeBaseNotesPanel } from '@/components/project/KnowledgeBaseNotesPanel';
import { TestScenariosPanel } from '@/components/project/TestScenariosPanel';
import { TestPromptSimulator } from '@/components/project/TestPromptSimulator';
import { VersionHistoryPanel } from '@/components/project/VersionHistoryPanel';
import { VoiceStylePanel } from '@/components/settings/VoiceStylePanel';
import { ConversationRulesPanel } from '@/components/settings/ConversationRulesPanel';
import { FallbackGuardrailsPanel } from '@/components/settings/FallbackGuardrailsPanel';
import { PostConversationSummaryPromptPanel } from '@/components/settings/PostConversationSummaryPromptPanel';

export default function ProjectStudioPage({ params }: { params: Promise<{ projectId: string }> }) {
  const [projectId, setProjectId] = React.useState('');
  const [project, setProject] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState('prompt');

  // Simulator test initial state
  const [testPersona, setTestPersona] = React.useState('easy caller');
  const [testMsg, setTestMsg] = React.useState('');

  const fetchProject = async (id: string) => {
    const res = await fetch(`/api/projects/${id}`).catch(() => null);
    if (res && res.ok) {
      const data = await res.json();
      setProject(data);
    }
    setLoading(false);
  };

  React.useEffect(() => {
    params.then(p => {
      setProjectId(p.projectId);
      fetchProject(p.projectId);
    });
    if (typeof window !== 'undefined') {
      const urlTab = new URLSearchParams(window.location.search).get('tab');
      if (urlTab) setActiveTab(urlTab);
    }
  }, [params]);

  const handleSavePrompt = async () => {
    if (!project) return;
    setSaving(true);
    await fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        finalPrompt: project.finalPrompt
      })
    });
    await fetchProject(projectId);
    setSaving(false);
  };

  const handleFieldUpdate = async (key: string, val: any) => {
    setProject((prev: any) => ({ ...prev, [key]: val }));
    await fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: val })
    });
  };

  const handlePublish = async () => {
    await fetch(`/api/projects/${projectId}/publish`, { method: 'POST' });
    fetchProject(projectId);
  };

  const handleUnpublish = async () => {
    await fetch(`/api/projects/${projectId}/unpublish`, { method: 'POST' });
    fetchProject(projectId);
  };

  const handleReEvaluate = async () => {
    const res = await fetch(`/api/projects/${projectId}/evaluate`, { method: 'POST' });
    if (res.ok) fetchProject(projectId);
  };

  const handleRestoreVersion = async (ver: any) => {
    await fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        finalPrompt: ver.finalPrompt,
        businessSpec: ver.businessSpec,
        blueprintJson: ver.blueprintJson
      })
    });
    fetchProject(projectId);
  };

  if (loading || !project) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-32 text-center space-y-3">
        <p className="text-[13px] text-[#62666d]">Loading workspace...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-8">
      
      {/* Top Breadcrumb Bar */}
      <div className="flex items-center justify-between mb-6 max-w-7xl w-full mx-auto">
        <Link href="/dashboard" className="inline-flex items-center text-[12px] text-[#62666d] hover:text-[#f7f8f8] transition-colors">
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Projects
        </Link>
        <span className="text-[11px] font-mono text-[#62666d]">
          {project.welcomeMessage ? `"${project.welcomeMessage.slice(0, 40)}..."` : ""}
        </span>
      </div>

      {/* Studio Dual Split Layout */}
      <div className="flex-1 flex flex-col lg:flex-row gap-6 max-w-7xl w-full mx-auto items-start">
        
        {/* Navigation Sidebar */}
        <PromptSettingsSidebar
          project={project}
          activeSection={activeTab}
          onSelectSection={setActiveTab}
          onPublish={handlePublish}
          onUnpublish={handleUnpublish}
        />

        {/* Main Content Area */}
        <div className="flex-1 w-full min-w-0 space-y-6">
          
          {activeTab === 'prompt' && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 min-h-[700px]">
              <AgentPromptEditor
                value={project.finalPrompt || ""}
                onChange={v => setProject({ ...project, finalPrompt: v })}
                onSave={handleSavePrompt}
                saving={saving}
              />
              <div className="space-y-6">
                <VoiceStylePanel project={project} onChange={handleFieldUpdate} />
                <ConversationRulesPanel project={project} onChange={handleFieldUpdate} />
                <FallbackGuardrailsPanel project={project} onChange={handleFieldUpdate} />
              </div>
            </div>
          )}

          {activeTab === 'system' && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 min-h-[700px]">
              <SystemPromptEditor
                value={project.finalPrompt || ""}
                onChange={v => setProject({ ...project, finalPrompt: v })}
                onSave={handleSavePrompt}
                saving={saving}
              />
              <PostConversationSummaryPromptPanel project={project} />
            </div>
          )}

          {activeTab === 'combined' && (
            <div className="bg-[#161822] border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h3 className="font-bold text-base text-white">Combined Final Runtime Prompt</h3>
                  <p className="text-xs text-slate-400">This exact combined string is injected into the AI voice engine at call start.</p>
                </div>
                <Button onClick={() => navigator.clipboard.writeText(project.finalPrompt || "")} variant="outline" className="text-xs">
                  Copy Combined Prompt
                </Button>
              </div>
              <pre className="p-4 bg-slate-950/90 border border-slate-800 rounded-xl font-mono text-xs text-slate-300 overflow-x-auto max-h-[650px] whitespace-pre-wrap leading-relaxed">
                {project.finalPrompt || ""}
              </pre>
            </div>
          )}

          {activeTab === 'radar' && (
            <QualityScoreCard project={project} onReEvaluate={handleReEvaluate} />
          )}

          {activeTab === 'simulator' && (
            <TestPromptSimulator
              projectId={project.id}
              defaultPersona={testPersona}
              initialMessage={testMsg}
            />
          )}

          {activeTab === 'variables' && (
            <DynamicVariablesTable
              projectId={project.id}
              variables={project.variables || []}
              onRefresh={() => fetchProject(projectId)}
            />
          )}

          {activeTab === 'functions' && (
            <SuggestedFunctionsPanel
              projectId={project.id}
              functions={project.functions || []}
              onRefresh={() => fetchProject(projectId)}
            />
          )}

          {activeTab === 'knowledge' && (
            <KnowledgeBaseNotesPanel
              projectId={project.id}
              notes={project.knowledgeNotes || []}
              onRefresh={() => fetchProject(projectId)}
            />
          )}

          {activeTab === 'scenarios' && (
            <TestScenariosPanel
              scenarios={project.testScenarios || []}
              onSelectPersona={(pers, msg) => {
                setTestPersona(pers);
                setTestMsg(msg);
                setActiveTab('simulator');
              }}
            />
          )}

          {activeTab === 'versions' && (
            <VersionHistoryPanel
              versions={project.versions || []}
              currentVersion={project.version || 1}
              onRestore={handleRestoreVersion}
            />
          )}

        </div>

      </div>

    </div>
  );
}
