import React from 'react';
import { Wrench, X, ChevronUp, ChevronDown, Minus } from 'lucide-react';

interface ToolChipProps {
  name: string;
  onRemove?: () => void;
}

export function ToolChip({ name, onRemove }: ToolChipProps) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft text-accent px-3 py-1 text-[13px] font-medium">
      <Wrench className="w-3.5 h-3.5" />
      {name}
      {onRemove && (
        <button type="button" onClick={onRemove} className="hover:text-accent-hover transition-colors rounded-full focus:outline-none focus:ring-2 focus:ring-accent-hover ml-1">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </span>
  );
}

interface CompactRowProps {
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  children: React.ReactNode;
}

export function CompactRow({ onRemove, onMoveUp, onMoveDown, children }: CompactRowProps) {
  return (
    <div className="card p-3 mb-2 flex items-start gap-3 bg-surface hover:border-line-strong transition-colors relative group">
      <div className="flex-1 min-w-0">{children}</div>
      <div className="flex flex-col items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="flex gap-1">
          {onMoveUp && <button type="button" onClick={onMoveUp} className="icon-btn !w-6 !h-6 !text-[10px]" title="Move up"><ChevronUp className="w-3.5 h-3.5" /></button>}
          {onMoveDown && <button type="button" onClick={onMoveDown} className="icon-btn !w-6 !h-6 !text-[10px]" title="Move down"><ChevronDown className="w-3.5 h-3.5" /></button>}
          <button type="button" onClick={onRemove} className="icon-btn !w-6 !h-6 !text-[10px] hover:!bg-danger-soft hover:!text-danger hover:!border-danger/40" title="Remove"><Minus className="w-3.5 h-3.5" /></button>
        </div>
      </div>
    </div>
  );
}

interface SidebarLinkProps {
  icon: any;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

export function SidebarLink({ icon: Icon, label, isActive, onClick }: SidebarLinkProps) {
  return (
    <button 
      type="button" 
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 text-[13px] font-medium rounded-md transition-colors text-left ${isActive ? 'bg-accent/10 text-accent' : 'text-graphite hover:text-ink hover:bg-subtle'}`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

interface SidebarGroupProps {
  title: string;
  children: React.ReactNode;
}

export function SidebarGroup({ title, children }: SidebarGroupProps) {
  return (
    <div className="mb-6">
      <span className="block text-[11px] font-semibold text-graphite/70 uppercase tracking-wider mb-2 px-3">{title}</span>
      <div className="flex flex-col gap-0.5">
        {children}
      </div>
    </div>
  );
}
