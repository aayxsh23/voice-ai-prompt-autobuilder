'use client';

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Send } from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleInputResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  const handleStartSession = async (promptText?: string) => {
    const text = promptText || input;
    if (!text.trim() || loading) return;
    setLoading(true);

    try {
      const res = await fetch('/api/builder/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentStep: 1, useCase: text.slice(0, 100) })
      });
      const data = await res.json();
      if (data && data.id) {
        router.push(`/builder/${data.id}?initialPrompt=${encodeURIComponent(text)}`);
      }
    } catch (err) {
      console.error("Failed to init session:", err);
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 bg-[#040404] text-[#f3f3f3] flex flex-col font-sans selection:bg-[#ff6c02] selection:text-[#040404] items-center justify-center p-6 min-h-[82vh]">
      <div className="space-y-6 w-full max-w-3xl text-center">
        <h1 className="text-[32px] sm:text-[42px] font-semibold text-[#f3f3f3] tracking-tight leading-[1.15]">
          What kind of Voice AI agent are we building today?
        </h1>
        <p className="text-[15px] text-[#909090] max-w-xl mx-auto leading-relaxed">
          Describe your business workflows, required caller checklist, FAQ answers, and transfer rules. Watch our AI architect a production-grade prompt package.
        </p>

        {/* Dynamic Auto-Expanding Input Bar */}
        <div className="mt-8 text-left">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleStartSession();
            }}
            className="w-full bg-[#0c0c0c] border border-[#252525] rounded-[16px] p-2 sm:p-3 focus-within:border-[#ff6c02] transition-colors shadow-2xl flex items-center gap-2"
          >
            <textarea
              ref={textareaRef}
              rows={2}
              value={input}
              onChange={handleInputResize}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleStartSession();
                }
              }}
              placeholder="Describe your voice agent (e.g. Dental clinic receptionist handling appointments, FAQs, and emergency transfers)..."
              disabled={loading}
              className="flex-1 bg-transparent border-none px-3 py-2 text-[15px] text-[#f3f3f3] placeholder-[#646464] focus:outline-none resize-none overflow-hidden leading-relaxed"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="bg-[#ff6c02] hover:bg-[#ff8025] disabled:opacity-40 text-[#040404] font-semibold w-10 h-10 rounded-[10px] flex items-center justify-center transition-colors cursor-pointer shrink-0 mr-0.5"
            >
              {loading ? (
                <div className="w-4 h-4 rounded-full border-2 border-[#040404] border-t-transparent animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
