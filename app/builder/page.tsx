'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

export default function BuilderRootPage() {
  const router = useRouter();

  React.useEffect(() => {
    const initSession = async () => {
      const res = await fetch('/api/builder/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentStep: 1 })
      });
      const data = await res.json();
      if (data && data.id) {
        router.replace(`/builder/${data.id}`);
      }
    };
    initSession();
  }, [router]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[70vh] text-center space-y-3">
      <h2 className="text-[15px] font-medium text-[#d0d6e0]">Initializing workspace...</h2>
      <p className="text-[12px] text-[#62666d]">Creating session state</p>
    </div>
  );
}
