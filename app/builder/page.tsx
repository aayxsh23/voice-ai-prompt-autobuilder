'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

export default function BuilderRootPage() {
  const router = useRouter();

  React.useEffect(() => {
    const initSession = async () => {
      try {
        const res = await fetch('/api/builder/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentStep: 1 })
        });
        const data = await res.json();
        if (data && data.id) {
          router.replace(`/builder/${data.id}`);
        }
      } catch (err) {
        console.error("Failed to init session:", err);
      }
    };
    initSession();
  }, [router]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[80vh] text-center space-y-4 bg-[#040404]">
      <div className="w-8 h-8 rounded-full border-2 border-[#ff6c02] border-t-transparent animate-spin mx-auto" />
      <p className="text-[14px] text-[#909090] font-medium tracking-tight">Initializing workspace...</p>
    </div>
  );
}
