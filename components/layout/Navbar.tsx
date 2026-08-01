import React from 'react';
import Link from 'next/link';
import { Plus, List } from 'lucide-react';

export const Navbar: React.FC = () => {
  return (
    <header className="sticky top-0 z-50 w-full bg-cream-paper hairline-border-muted border-t-0 border-r-0 border-l-0">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 relative">
        {/* Left Side: Past Projects */}
        <div className="flex-1 flex justify-start">
          <Link href="/dashboard" className="inline-flex items-center justify-center h-10 px-6 font-medium text-[16px] text-ink bg-transparent border border-transparent hover:hairline-border rounded-[24px] transition-all">
            <List className="w-4 h-4 mr-2" />
            Past Projects
          </Link>
        </div>

        {/* Center: TechLadder.ai Logo */}
        <div className="flex-1 flex justify-center">
          <Link href="/" className="flex items-center text-ink hover:text-graphite transition-colors">
            <span className="font-medium text-[20px] tracking-tight">
              TechLadder.ai
            </span>
          </Link>
        </div>

        {/* Right Side: New Session */}
        <div className="flex-1 flex justify-end">
          <Link href="/builder" className="inline-flex items-center justify-center h-10 px-6 font-medium text-[16px] text-ink bg-sunshine-highlight rounded-[24px] hover:opacity-90 transition-opacity">
            <Plus className="w-4 h-4 mr-2" />
            New Session
          </Link>
        </div>
      </div>
    </header>
  );
};
