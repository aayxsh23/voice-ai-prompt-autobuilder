'use client';

import React from 'react';
import Link from 'next/link';
import { Plus, Search, FolderKanban } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { PromptProjectCard } from '@/components/dashboard/PromptProjectCard';

export default function DashboardPage() {
  const [projects, setProjects] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');

  const fetchProjects = async () => {
    setLoading(true);
    const res = await fetch('/api/projects').catch(() => null);
    if (res) {
      const data = await res.json();
      setProjects(Array.isArray(data) ? data : []);
    }
    setLoading(false);
  };

  React.useEffect(() => {
    fetchProjects();
  }, []);

  const handleDuplicate = async (project: any) => {
    await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...project,
        name: `${project.name} (Copy)`
      })
    });
    fetchProjects();
  };

  const handleDelete = async (project: any) => {
    if (!confirm(`Are you sure you want to permanently delete "${project.name}"?`)) return;
    
    await fetch(`/api/projects/${project.id}`, {
      method: 'DELETE',
    });
    fetchProjects();
  };

  const handleRename = async (project: any) => {
    const newName = prompt('Enter new project name:', project.name);
    if (!newName || newName.trim() === '' || newName === project.name) return;

    await fetch(`/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() })
    });
    fetchProjects();
  };

  const filtered = projects.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.industry?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 max-w-7xl w-full mx-auto p-6 sm:p-10 space-y-8">
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
        <div className="space-y-1">
          <h1 className="text-[24px] font-medium text-ink tracking-tight">
            Prompt Projects
          </h1>
          <p className="text-[14px] text-graphite">Manage, audit, and version your AI telephony prompt architectures.</p>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/builder">
            <Button className="font-medium px-5 h-9 text-[13px] bg-ink text-cream-paper hover:opacity-90 rounded-buttons">
              <Plus className="mr-1.5 h-4 w-4" /> Create Session
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="relative max-w-md w-full">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-graphite" />
          <Input
            placeholder="Search projects by name or industry..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 h-10 bg-white hairline-border text-ink placeholder-graphite rounded-inputs focus:hairline-border"
          />
        </div>
        <div className="text-[13px] text-graphite font-mono hidden sm:block">
          {filtered.length} of {projects.length}
        </div>
      </div>

      {loading ? (
        <div className="py-24 text-center space-y-3">
          <div className="w-8 h-8 rounded-full border-2 border-sunshine-highlight border-t-transparent animate-spin mx-auto" />
          <p className="text-[14px] text-graphite">Loading projects...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-24 text-center bg-cream-paper rounded-cards border border-dashed hairline-border-muted p-8 space-y-4 max-w-lg mx-auto">
          <FolderKanban className="h-10 w-10 text-graphite mx-auto" />
          <h3 className="font-medium text-ink text-[16px]">No projects found</h3>
          <p className="text-[14px] text-graphite leading-relaxed">
            Start a new session with our Architect Bot to compile a tailored blueprint.
          </p>
          <Link href="/builder">
            <Button className="text-[13px] font-medium px-5 mt-2 bg-ink text-cream-paper hover:opacity-90 rounded-buttons">
              <Plus className="mr-1.5 h-4 w-4" /> Start Session
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(proj => (
            <PromptProjectCard
              key={proj.id}
              project={proj}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
              onRename={handleRename}
            />
          ))}
        </div>
      )}

    </div>
  );
}
