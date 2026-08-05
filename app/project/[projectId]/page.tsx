'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AgentPromptEditor } from '@/components/project/AgentPromptEditor';
import { Badge } from '@/components/ui';

interface Project {
  id: string;
  name: string;
  status?: string;
  industry?: string;
  finalPrompt?: string;
  welcomeMessage?: string;
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
      body: JSON.stringify({ finalPrompt: project.finalPrompt }),
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

  const isPublished = project.status === 'published';

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-1 flex-col px-6 py-6">
      <div className="mb-4 shrink-0">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-[13px] text-graphite transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Projects
        </Link>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[20px] font-semibold text-ink">{project.name}</h1>
          <Badge variant={isPublished ? 'success' : 'neutral'}>
            <span className={`h-1.5 w-1.5 rounded-full ${isPublished ? 'bg-success' : 'bg-faint'}`} />
            {isPublished ? 'Published' : 'Draft'}
          </Badge>
        </div>
      </div>

      <div className="flex min-h-[70vh] flex-1 flex-col -mx-6 -my-6">
        <AgentPromptEditor
          draft={{ finalPrompt: project.finalPrompt || '' } as any}
          onChangeDraft={(d) => setProject({ ...project, finalPrompt: d.finalPrompt })}
          onSave={handleSavePrompt}
          onBack={() => router.push('/dashboard')}
          saving={saving}
        />
      </div>
    </div>
  );
}
