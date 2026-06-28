import React from 'react';
import { Card, Button, Badge } from '../ui';
import { Sliders, ShieldAlert, Sparkles, History, MessageSquare, Code2, BookOpen, Layers } from 'lucide-react';

interface Props {
  project: any;
  activeSection: string;
  onSelectSection: (sec: string) => void;
  onPublish: () => Promise<void>;
  onUnpublish: () => Promise<void>;
}

export const PromptSettingsSidebar: React.FC<Props> = ({
  project,
  activeSection,
  onSelectSection,
  onPublish,
  onUnpublish
}) => {
  const [publishing, setPublishing] = React.useState(false);
  const isPub = project.status === 'published';

  const handlePubToggle = async () => {
    setPublishing(true);
    if (isPub) await onUnpublish();
    else await onPublish();
    setPublishing(false);
  };

  const navs = [
    { id: 'prompt', label: 'Agent Blueprint', icon: Code2 },
    { id: 'system', label: 'System Prompt', icon: Sliders },
    { id: 'combined', label: 'Combined Final Prompt', icon: Layers },
    { id: 'radar', label: 'Quality Radar', icon: Sparkles },
    { id: 'simulator', label: 'Simulator', icon: MessageSquare },
    { id: 'variables', label: 'Variables', icon: Sliders },
    { id: 'functions', label: 'Functions', icon: Code2 },
    { id: 'knowledge', label: 'Knowledge Base', icon: BookOpen },
    { id: 'scenarios', label: 'Test Scenarios', icon: ShieldAlert },
    { id: 'versions', label: 'Versions', icon: History },
  ];

  return (
    <div className="w-full lg:w-56 shrink-0 space-y-3">
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Badge variant={isPub ? "success" : "outline"} className="uppercase text-[10px]">
            <span className={`h-1.5 w-1.5 rounded-full mr-1.5 ${isPub ? 'bg-[#27a644]' : 'bg-[#62666d]'}`} />
            {project.status}
          </Badge>
          <span className="text-[11px] font-mono text-[#62666d]">v{project.version}</span>
        </div>
        <div>
          <h3 className="font-medium text-[14px] text-[#f7f8f8] line-clamp-1">{project.name}</h3>
          <p className="text-[11px] text-[#62666d] line-clamp-1 font-mono">{project.agentName} · {project.industry}</p>
        </div>
        <Button
          onClick={handlePubToggle}
          disabled={publishing}
          variant={isPub ? "secondary" : "default"}
          className="w-full text-[12px] h-8"
        >
          {publishing ? "Processing..." : isPub ? "Revert to Draft" : "Publish"}
        </Button>
      </Card>

      <div className="bg-[#0f1011] rounded-[12px] border border-[#23252a] p-1.5 space-y-0.5">
        {navs.map(item => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectSection(item.id)}
              className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-[6px] text-[12px] transition-colors cursor-pointer text-left ${
                active ? "bg-[#161718] text-[#f7f8f8] font-medium" : "text-[#62666d] hover:text-[#8a8f98] hover:bg-[#161718]/50"
              }`}
            >
              <Icon className={`h-3.5 w-3.5 ${active ? "text-[#8a8f98]" : "text-[#323334]"}`} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
