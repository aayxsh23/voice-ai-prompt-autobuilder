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

  const handleArchive = async (project: any) => {
    await fetch(`/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' })
    });
    fetchProjects();
  };

  const filtered = projects.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.industry?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 max-w-7xl w-full mx-auto p-6 sm:p-10 space-y-8">
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#23252a] pb-6">
        <div className="space-y-1">
          <h1 className="text-[24px] font-light text-[#f7f8f8] tracking-[-0.264px]">
            Prompt Projects
          </h1>
          <p className="text-[#62666d] text-[13px]">Manage, audit, and version your AI telephony prompt architectures.</p>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/builder">
            <Button className="font-medium px-5 h-9 text-[13px]">
              <Plus className="mr-1.5 h-4 w-4" /> Create Project
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="relative max-w-md w-full">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-[#62666d]" />
          <Input
            placeholder="Search projects by name or industry..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 h-10"
          />
        </div>
        <div className="text-[12px] text-[#62666d] font-mono hidden sm:block">
          {filtered.length} of {projects.length}
        </div>
      </div>

      {loading ? (
        <div className="py-24 text-center space-y-3">
          <p className="text-[13px] text-[#62666d]">Loading projects...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-24 text-center bg-[#161718] rounded-[12px] border border-dashed border-[#23252a] p-8 space-y-4 max-w-lg mx-auto">
          <FolderKanban className="h-10 w-10 text-[#323334] mx-auto" />
          <h3 className="font-medium text-[#d0d6e0] text-[15px]">No projects found</h3>
          <p className="text-[12px] text-[#62666d] leading-relaxed">
            Start by running the Prompt Wizard to compile a tailored blueprint.
          </p>
          <Link href="/builder">
            <Button className="text-[13px] font-medium px-5 mt-2">
              <Plus className="mr-1.5 h-4 w-4" /> Start Wizard
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(proj => (
            <PromptProjectCard
              key={proj.id}
              project={proj}
              onDuplicate={handleDuplicate}
              onArchive={handleArchive}
            />
          ))}
        </div>
      )}

    </div>
  );
}
