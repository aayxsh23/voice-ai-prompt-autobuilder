import React from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';

export const Navbar: React.FC = () => {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/20 glass-panel">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between gap-4 px-6">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-[14px] font-semibold tracking-[-0.01em] text-ink">
            TechLadder.ai
          </Link>
          <Link
            href="/dashboard"
            className="text-[13px] font-medium text-graphite transition-colors hover:text-ink"
          >
            Projects
          </Link>
        </div>

        <Link
          href="/builder"
          className="btn btn-primary"
        >
          <Plus className="h-3.5 w-3.5" />
          New session
        </Link>
      </div>
    </header>
  );
};
