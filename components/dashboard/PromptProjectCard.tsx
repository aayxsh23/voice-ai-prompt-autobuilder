import React from 'react';
import Link from 'next/link';
import { Card, Badge, Button } from '../ui';
import { Calendar, ArrowUpRight, Copy, Trash2, Edit2 } from 'lucide-react';

interface ProjectCardProps {
  project: any;
  onDuplicate?: (project: any) => void;
  onDelete?: (project: any) => void;
  onRename?: (project: any) => void;
}

export const PromptProjectCard: React.FC<ProjectCardProps> = ({ project, onDuplicate, onDelete, onRename }) => {
  const isPublished = project.status === 'published';
  let primaryGoal = project.useCase;
  try {
    const spec = typeof project.businessSpec === 'string' ? JSON.parse(project.businessSpec) : project.businessSpec;
    if (spec?.meta?.primaryGoal) {
      primaryGoal = spec.meta.primaryGoal;
    }
  } catch (e) {
    // Ignore parse errors
  }

  return (
    <Card className="flex flex-col justify-between p-5 bg-white hairline-border hover:border-black/20 transition-colors rounded-cards">
      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[10px] uppercase font-mono text-graphite tracking-wider">{project.industry}</span>
            <h3 className="font-medium text-ink text-[16px] line-clamp-1 mt-0.5">{project.name}</h3>
          </div>
          <Badge variant={isPublished ? "success" : "outline"} className="capitalize text-[10px] bg-cream-paper border-black/10">
            <span className={`h-1.5 w-1.5 rounded-full mr-1.5 ${isPublished ? 'bg-sunshine-highlight' : 'bg-graphite'}`} />
            <span className="text-ink">{project.status}</span>
          </Badge>
        </div>

        <p className="text-[13px] text-graphite line-clamp-2 leading-relaxed mt-2">
          {primaryGoal && primaryGoal.trim() !== "Custom Voice Agent Prompt" 
            ? primaryGoal.charAt(0).toUpperCase() + primaryGoal.slice(1) 
            : "Custom Voice Agent Prompt Architecture."}
        </p>
      </div>

      <div className="flex items-center justify-between mt-6">
        <span className="text-[13px] text-graphite flex items-center gap-1.5 font-mono font-medium">
          <Calendar className="h-4 w-4" /> {new Date(project.updatedAt || Date.now()).toLocaleDateString()}
        </span>

        <div className="flex items-center space-x-1">
          {onRename && (
            <Button variant="ghost" size="sm" onClick={() => onRename(project)} title="Rename Project" className="h-8 w-8 p-0 text-graphite hover:text-ink hover:bg-black/5">
              <Edit2 className="h-4 w-4" />
            </Button>
          )}
          {onDuplicate && (
            <Button variant="ghost" size="sm" onClick={() => onDuplicate(project)} title="Duplicate Project" className="h-8 w-8 p-0 text-graphite hover:text-ink hover:bg-black/5">
              <Copy className="h-4 w-4" />
            </Button>
          )}
          {onDelete && (
            <Button variant="ghost" size="sm" onClick={() => onDelete(project)} title="Delete Project" className="h-8 w-8 p-0 text-graphite hover:text-red-600 hover:bg-red-50">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Link href={`/project/${project.id}`}>
            <Button size="sm" className="text-[13px] px-4 h-8 bg-ink hover:opacity-90 text-cream-paper rounded-buttons font-medium ml-1">
              Open <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  );
};
