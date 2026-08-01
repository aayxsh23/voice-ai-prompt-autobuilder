'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { AgentPromptEditor } from '@/components/project/AgentPromptEditor';

export default function ProjectStudioPage({ params }: { params: Promise<{ projectId: string }> }) {
  const [projectId, setProjectId] = React.useState('');
  const [project, setProject] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

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

  if (loading || !project) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-32 text-center space-y-3">
        <div className="w-8 h-8 rounded-full border-2 border-sunshine-highlight border-t-transparent animate-spin mx-auto" />
        <p className="text-[14px] text-graphite">Loading workspace...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-8">
      {/* Top Breadcrumb Bar */}
      <div className="flex items-center justify-between mb-6 max-w-5xl w-full mx-auto">
        <Link href="/dashboard" className="inline-flex items-center text-[13px] text-graphite hover:text-ink transition-colors font-medium">
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Projects
        </Link>
        <span className="text-[13px] font-mono text-graphite">
          {project.welcomeMessage ? `"${project.welcomeMessage.slice(0, 40)}..."` : project.name}
        </span>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 w-full max-w-5xl mx-auto space-y-6">
        <div className="grid grid-cols-1 gap-6 min-h-[750px]">
          <AgentPromptEditor
            value={project.finalPrompt || ""}
            onChange={v => setProject({ ...project, finalPrompt: v })}
            onSave={handleSavePrompt}
            saving={saving}
          />
        </div>
      </div>
    </div>
  );
}
