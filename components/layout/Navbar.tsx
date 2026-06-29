import React from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Button } from '../ui';

export const Navbar: React.FC = () => {
  return (
    <header className="sticky top-0 z-50 w-full bg-[#0c0c0c] border-b border-[#252525]">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <div className="flex items-center space-x-8">
          <Link href="/" className="flex items-center space-x-2.5 group">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff6c02] shrink-0 shadow-[0_0_8px_#ff6c02]" />
            <span className="font-semibold text-[15px] text-[#f3f3f3] tracking-tight">
              VoiceAgent Studio
            </span>
          </Link>

          <nav className="flex items-center space-x-2">
            <Link href="/dashboard">
              <Button variant="ghost" className="text-sm text-[#909090] hover:text-[#f3f3f3]">
                Projects
              </Button>
            </Link>
          </nav>
        </div>

        <div className="flex items-center space-x-3">
          <Link href="/builder">
            <Button className="text-sm font-medium px-4 h-9 bg-[#ff6c02] text-[#f3f3f3] hover:bg-[#ff8025] rounded-[4px]">
              <Plus className="mr-1.5 h-4 w-4" /> New Session
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
};
