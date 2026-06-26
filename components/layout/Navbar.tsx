import React from 'react';
import Link from 'next/link';
import { Bot, Plus, LayoutGrid } from 'lucide-react';
import { Button } from '../ui';

export const Navbar: React.FC = () => {
  return (
    <header className="sticky top-0 z-50 w-full bg-[#0f1011] border-b border-[#23252a]">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <div className="flex items-center space-x-8">
          <Link href="/" className="flex items-center space-x-2.5 group">
            <Bot className="h-5 w-5 text-[#8a8f98] group-hover:text-[#f7f8f8] transition-colors" />
            <span className="font-semibold text-[15px] text-[#f7f8f8] tracking-[-0.01em]">
              VoiceAgent Studio
            </span>
          </Link>

          <nav className="hidden md:flex items-center space-x-1">
            <Link href="/dashboard">
              <Button variant="ghost" className="text-sm text-[#8a8f98] hover:text-[#f7f8f8]">
                <LayoutGrid className="mr-2 h-4 w-4" /> Projects
              </Button>
            </Link>
          </nav>
        </div>

        <div className="flex items-center space-x-3">
          <Link href="/builder">
            <Button className="text-sm font-medium px-4 h-9">
              <Plus className="mr-1.5 h-4 w-4" /> New Prompt
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
};
