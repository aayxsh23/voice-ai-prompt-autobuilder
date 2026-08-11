'use client';

import React from 'react';
import { Plus, Search, Loader2 } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { PromptProjectCard } from '@/components/dashboard/PromptProjectCard';
import { CreateAgentModal } from '@/components/dashboard/CreateAgentModal';
import { useRouter } from 'next/navigation';
interface Project {
  id: string;
  name: string;
  industry?: string;
  status?: string;
  useCase?: string;
  businessSpec?: string;
  updatedAt?: string;
}

export default function DashboardPage() {
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [projectToDelete, setProjectToDelete] = React.useState<Project | null>(null);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const router = useRouter();
  // No synchronous setState here: `loading` starts true and the first statement is
  // an await, so mounting doesn't trigger a cascading render. Refreshes after a
  // mutation deliberately skip the spinner — the list is already on screen and
  // flashing it back to "Loading…" reads as a glitch.
  const fetchProjects = React.useCallback(async () => {
    const res = await fetch('/api/projects').catch(() => null);
    if (res) {
      const data = await res.json();
      setProjects(Array.isArray(data) ? data : []);
    }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch('/api/projects').catch(() => null);
      if (cancelled) return;
      if (res) {
        const data = await res.json();
        if (cancelled) return;
        setProjects(Array.isArray(data) ? data : []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDuplicate = async (project: Project) => {
    await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...project, name: `${project.name} (Copy)` }),
    });
    fetchProjects();
  };

  const handleDelete = (project: Project) => {
    setProjectToDelete(project);
  };

  const confirmDelete = async () => {
    if (!projectToDelete) return;
    await fetch(`/api/projects/${projectToDelete.id}`, { method: 'DELETE' });
    fetchProjects();
    setProjectToDelete(null);
  };

  const handleRename = async (project: Project) => {
    const newName = prompt('Project name', project.name);
    if (!newName || !newName.trim() || newName === project.name) return;
    await fetch(`/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    });
    fetchProjects();
  };

  const filtered = projects.filter(
    (p) =>
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.industry?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold text-ink">Projects</h1>
          <p className="mt-0.5 text-[13px] text-graphite">
            Prompt packages for your telephony agents.
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          New session
        </Button>
      </div>

      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
          <Input
            placeholder="Search projects"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
            aria-label="Search projects"
          />
        </div>
        {!loading && projects.length > 0 && (
          <span className="hidden shrink-0 text-[13px] text-graphite sm:block">
            {filtered.length === projects.length
              ? `${projects.length} project${projects.length === 1 ? '' : 's'}`
              : `${filtered.length} of ${projects.length}`}
          </span>
        )}
      </div>

      {loading ? (
        <p className="flex items-center justify-center gap-2 py-24 text-[13px] text-graphite">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading projects…
        </p>
      ) : filtered.length === 0 ? (
        <div className="card mx-auto max-w-md px-6 py-12 text-center">
          <h2 className="text-[14px] font-medium text-ink">
            {projects.length === 0 ? 'No projects yet' : 'No matches'}
          </h2>
          <p className="mx-auto mt-1 max-w-xs text-[13px] text-graphite">
            {projects.length === 0
              ? 'Start a session to compile your first prompt package.'
              : `Nothing matches “${search}”.`}
          </p>
          {projects.length === 0 ? (
            <Button className="mt-4" onClick={() => setIsModalOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              New session
            </Button>
          ) : (
            <Button variant="secondary" className="mt-4" onClick={() => setSearch('')}>
              Clear search
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((proj) => (
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

      {/* Delete Confirmation Modal */}
      {projectToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4">
          <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-5 shadow-lg">
            <h3 className="text-[15px] font-semibold text-ink mb-2">Delete project?</h3>
            <p className="text-[13px] text-graphite mb-5">
              Permanently delete &quot;{projectToDelete.name}&quot;? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setProjectToDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary !bg-warning !border-warning !text-white hover:!bg-warning/90"
                onClick={confirmDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <CreateAgentModal
          onClose={() => setIsModalOpen(false)}
          onSelectMode={(mode) => {
            setIsModalOpen(false);
            router.push(`/builder?mode=${mode}`);
          }}
        />
      )}
    </div>
  );
}
