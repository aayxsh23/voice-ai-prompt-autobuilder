'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AgentPromptEditor } from '@/components/project/AgentPromptEditor';

interface Project {
  id: string;
  name: string;
  status?: string;
  industry?: string;
  finalPrompt?: string;
  welcomeMessage?: string;
  businessSpec?: string;
  variables?: Record<string, unknown>[];
  functions?: Record<string, unknown>[];
}

export default function ProjectStudioPage({ params }: { params: Promise<{ projectId: string }> }) {
  const router = useRouter();
  const [projectId, setProjectId] = React.useState('');
  const [project, setProject] = React.useState<Project | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const fetchProject = async (id: string) => {
    const res = await fetch(`/api/projects/${id}`).catch(() => null);
    if (res && res.ok) setProject(await res.json());
    setLoading(false);
  };

  React.useEffect(() => {
    params.then((p) => {
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
        finalPrompt: project.finalPrompt,
        businessSpec: project.businessSpec,
        languageMode: project.businessSpec ? JSON.parse(project.businessSpec)?.meta?.languageMode : undefined,
      }),
    });
    await fetchProject(projectId);
    setSaving(false);
  };

  if (loading || !project) {
    return (
      <p className="flex flex-1 items-center justify-center gap-2 py-32 text-[13px] text-graphite">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Loading project…
      </p>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full bg-canvas animate-fade-in-up">
      <AgentPromptEditor
        projectName={project.name}
        draft={{ 
          finalPrompt: project.finalPrompt || '',
          businessSpec: project.businessSpec ? JSON.parse(project.businessSpec) : undefined,
          dynamicVariables: project.variables || [],
          suggestedFunctions: project.functions || [],
        } as any}
        onChangeDraft={(d) => setProject({ 
          ...project, 
          finalPrompt: d.finalPrompt,
          businessSpec: d.businessSpec ? JSON.stringify(d.businessSpec) : project.businessSpec,
          variables: d.dynamicVariables || project.variables,
          functions: d.suggestedFunctions || project.functions
        })}
        onSave={handleSavePrompt}
        onBack={() => router.push('/dashboard')}
        saving={saving}
      />
    </div>
  );
}
