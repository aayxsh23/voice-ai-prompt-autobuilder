import React from 'react';
import Link from 'next/link';
import { Card, Badge, Button } from '../ui';
import { Calendar, ArrowUpRight, Copy, Archive, CheckCircle2, FileText } from 'lucide-react';

interface ProjectCardProps {
  project: any;
  onDuplicate?: (project: any) => void;
  onArchive?: (project: any) => void;
}

export const PromptProjectCard: React.FC<ProjectCardProps> = ({ project, onDuplicate, onArchive }) => {
  const isPublished = project.status === 'published';

  return (
    <Card className="flex flex-col justify-between p-5 bg-[#0c0c0c] border-[#252525] hover:border-[#303030] transition-colors rounded-[12px]">
      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[10px] uppercase font-mono text-[#646464] tracking-wider">{project.industry}</span>
            <h3 className="font-medium text-[#f3f3f3] text-[14px] line-clamp-1 mt-0.5">{project.name}</h3>
          </div>
          <Badge variant={isPublished ? "success" : "outline"} className="capitalize text-[10px]">
            <span className={`h-1.5 w-1.5 rounded-full mr-1.5 ${isPublished ? 'bg-[#ff6c02]' : 'bg-[#646464]'}`} />
            {project.status}
          </Badge>
        </div>

        <p className="text-[12px] text-[#909090] line-clamp-2 leading-relaxed">
          {project.welcomeMessage || project.useCase || "Custom Voice Agent Prompt Architecture."}
        </p>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#25252a] text-center">
          <div className="bg-[#121212] p-1.5 rounded-[4px] border border-[#252525]">
            <span className="block text-[10px] text-[#646464]">Quality</span>
            <span className="text-[12px] font-mono font-medium text-[#f3f3f3]">{project.qualityScore}%</span>
          </div>
          <div className="bg-[#121212] p-1.5 rounded-[4px] border border-[#252525]">
            <span className="block text-[10px] text-[#646464]">Safety</span>
            <span className="text-[12px] font-mono font-medium text-[#ff6c02]">{project.safetyScore}%</span>
          </div>
          <div className="bg-[#121212] p-1.5 rounded-[4px] border border-[#252525]">
            <span className="block text-[10px] text-[#646464]">Version</span>
            <span className="text-[12px] font-mono font-medium text-[#909090]">v{project.version}</span>
          </div>
        </div>
      </div>

      <div className="pt-4 mt-4 border-t border-[#25252a] flex items-center justify-between">
        <span className="text-[10px] text-[#646464] flex items-center gap-1 font-mono">
          <Calendar className="h-3 w-3" /> {new Date(project.updatedAt || Date.now()).toLocaleDateString()}
        </span>

        <div className="flex items-center space-x-1">
          {onDuplicate && (
            <Button variant="ghost" size="sm" onClick={() => onDuplicate(project)} title="Duplicate Project" className="h-7 w-7 p-0 text-[#909090] hover:text-[#f3f3f3]">
              <Copy className="h-3.5 w-3.5" />
            </Button>
          )}
          {onArchive && (
            <Button variant="ghost" size="sm" onClick={() => onArchive(project)} title="Archive Project" className="h-7 w-7 p-0 text-[#646464] hover:text-[#ff6c02]">
              <Archive className="h-3.5 w-3.5" />
            </Button>
          )}
          <Link href={`/project/${project.id}`}>
            <Button size="sm" className="text-[12px] px-3 h-7 bg-[#1b1b1b] hover:bg-[#252525] text-[#f3f3f3] border border-[#303030] rounded-[4px]">
              Open <ArrowUpRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  );
};
