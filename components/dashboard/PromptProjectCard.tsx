import React from 'react';
import Link from 'next/link';
import { Badge, Button } from '../ui';
import { Copy, Trash2, Edit2 } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  industry?: string;
  status?: string;
  useCase?: string;
  businessSpec?: string;
  updatedAt?: string;
}

interface ProjectCardProps {
  project: Project;
  onDuplicate?: (project: Project) => void;
  onDelete?: (project: Project) => void;
  onRename?: (project: Project) => void;
}

function resolveGoal(project: Project): string {
  try {
    const spec = typeof project.businessSpec === 'string' ? JSON.parse(project.businessSpec) : project.businessSpec;
    if (spec?.meta?.primaryGoal) return spec.meta.primaryGoal;
  } catch {
    // Malformed spec — fall through to the stored use case.
  }
  return project.useCase || '';
}

export const PromptProjectCard: React.FC<ProjectCardProps> = ({ project, onDuplicate, onDelete, onRename }) => {
  const isPublished = project.status === 'published';
  const goal = resolveGoal(project);
  const description =
    goal && goal.trim() !== 'Custom Voice Agent Prompt' ? goal.charAt(0).toUpperCase() + goal.slice(1) : '';

  return (
    <div className="card group flex flex-col p-4 transition-all hover:border-accent hover:shadow-sm animate-slide-up">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/project/${project.id}`} className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-medium text-ink group-hover:text-accent">{project.name}</h3>
          {project.industry && <p className="mt-0.5 truncate text-[13px] text-graphite">{project.industry}</p>}
        </Link>
        <Badge variant={isPublished ? 'success' : 'neutral'}>
          <span className={`h-1.5 w-1.5 rounded-full ${isPublished ? 'bg-success' : 'bg-faint'}`} />
          {isPublished ? 'Published' : 'Draft'}
        </Badge>
      </div>

      <p className="mt-3 line-clamp-2 min-h-[2.6em] text-[13px] leading-[1.45] text-graphite">
        {description || <span className="text-faint">No description</span>}
      </p>

      <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
        <span className="text-[12px] text-faint">
          {project.updatedAt
            ? `Updated ${new Date(project.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
            : ''}
        </span>

        {/* Secondary actions stay quiet until the card is engaged; they remain
            reachable by keyboard because focus-within also reveals them. */}
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {onRename && (
            <Button variant="ghost" size="icon" onClick={() => onRename(project)} aria-label={`Rename ${project.name}`}>
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
          )}
          {onDuplicate && (
            <Button variant="ghost" size="icon" onClick={() => onDuplicate(project)} aria-label={`Duplicate ${project.name}`}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          )}
          {onDelete && (
            <Button variant="danger" size="icon" onClick={() => onDelete(project)} aria-label={`Delete ${project.name}`}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
