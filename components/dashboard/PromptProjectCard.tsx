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
    <Card className="flex flex-col justify-between p-5 hover:border-[#323334] transition-colors">
      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[10px] uppercase font-mono text-[#62666d] tracking-wider">{project.industry}</span>
            <h3 className="font-medium text-[#f7f8f8] text-[14px] line-clamp-1 mt-0.5">{project.name}</h3>
          </div>
          <Badge variant={isPublished ? "success" : "outline"} className="capitalize text-[10px]">
            <span className={`h-1.5 w-1.5 rounded-full mr-1.5 ${isPublished ? 'bg-[#27a644]' : 'bg-[#62666d]'}`} />
            {project.status}
          </Badge>
        </div>

        <p className="text-[12px] text-[#62666d] line-clamp-2 leading-relaxed">
          {project.welcomeMessage || project.useCase || "Custom Voice Agent Prompt Architecture."}
        </p>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#23252a] text-center">
          <div className="bg-[#0f1011] p-1.5 rounded-[6px]">
            <span className="block text-[10px] text-[#62666d]">Quality</span>
            <span className="text-[12px] font-mono font-medium text-[#f7f8f8]">{project.qualityScore}%</span>
          </div>
          <div className="bg-[#0f1011] p-1.5 rounded-[6px]">
            <span className="block text-[10px] text-[#62666d]">Safety</span>
            <span className="text-[12px] font-mono font-medium text-[#27a644]">{project.safetyScore}%</span>
          </div>
          <div className="bg-[#0f1011] p-1.5 rounded-[6px]">
            <span className="block text-[10px] text-[#62666d]">Version</span>
            <span className="text-[12px] font-mono font-medium text-[#8a8f98]">v{project.version}</span>
          </div>
        </div>
      </div>

      <div className="pt-4 mt-4 border-t border-[#23252a] flex items-center justify-between">
        <span className="text-[10px] text-[#62666d] flex items-center gap-1 font-mono">
          <Calendar className="h-3 w-3" /> {new Date(project.updatedAt || Date.now()).toLocaleDateString()}
        </span>

        <div className="flex items-center space-x-1">
          {onDuplicate && (
            <Button variant="ghost" size="sm" onClick={() => onDuplicate(project)} title="Duplicate Project" className="h-7 w-7 p-0">
              <Copy className="h-3.5 w-3.5" />
            </Button>
          )}
          {onArchive && (
            <Button variant="ghost" size="sm" onClick={() => onArchive(project)} title="Archive Project" className="h-7 w-7 p-0 text-[#62666d] hover:text-[#eb5757]">
              <Archive className="h-3.5 w-3.5" />
            </Button>
          )}
          <Link href={`/project/${project.id}`}>
            <Button size="sm" className="text-[12px] px-3 h-7">
              Open <ArrowUpRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  );
};
