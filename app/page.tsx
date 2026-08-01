'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, List } from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleStartSession = async () => {
    if (loading) return;
    setLoading(true);

    try {
      const res = await fetch('/api/builder/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentStep: 1, useCase: "Form Based Prompt" })
      });
      const data = await res.json();
      if (data && data.id) {
        router.push(`/builder/${data.id}`);
      }
    } catch (err) {
      console.error("Failed to init session:", err);
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-[82vh]">
      <div className="max-w-[1200px] w-full flex flex-col items-center text-center space-y-8">
        

        {/* Display Headline */}
        <h1 className="text-[64px] font-medium text-ink leading-[1.25] tracking-[-0.016em] max-w-[800px]">
          Design Voice AI Agents with Precision
        </h1>
        
        {/* Subhead */}
        <p className="text-[18px] text-graphite max-w-[640px] leading-[1.5]">
          A clean, structural builder to compile production-grade system prompts for telephony AI. Set up identities, workflows, and edge-cases without wrestling with prompt engineering.
        </p>

        {/* Action Buttons */}
        <div className="flex items-center justify-center gap-4 pt-8">
          <button 
            onClick={handleStartSession}
            disabled={loading}
            className="inline-flex items-center justify-center h-12 px-6 bg-sunshine-highlight text-ink rounded-buttons font-medium text-[16px] hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? (
               <div className="w-4 h-4 rounded-full border-2 border-ink border-t-transparent animate-spin mr-2" />
            ) : (
              <Plus className="w-4 h-4 mr-2" />
            )}
            New Prompt
          </button>

          <button 
            onClick={() => router.push('/dashboard')}
            className="inline-flex items-center justify-center h-12 px-6 bg-transparent text-ink border border-ink rounded-buttons font-medium text-[16px] hover:bg-black/5 transition-colors"
          >
            <List className="w-4 h-4 mr-2" />
            Past Projects
          </button>
        </div>

      </div>
    </div>
  );
}
