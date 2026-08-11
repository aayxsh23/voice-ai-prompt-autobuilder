'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

function BuilderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    const initSession = async () => {
      try {
        const res = await fetch('/api/builder/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentStep: 1 }),
        });
        const data = await res.json();
        if (data?.id) {
          const mode = searchParams.get('mode') || 'auto';
          router.replace(`/builder/${data.id}?mode=${mode}`);
        }
        else setFailed(true);
      } catch {
        setFailed(true);
      }
    };
    initSession();
  }, [router, searchParams]);

  if (failed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <h1 className="text-xl font-medium text-red-500 mb-2">Could not start session</h1>
        <p className="text-zinc-400">Please try again later.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      <p className="text-zinc-400">Initializing builder session...</p>
    </div>
  );
}

export default function BuilderRootPage() {
  return (
    <React.Suspense fallback={
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        <p className="text-zinc-400">Loading...</p>
      </div>
    }>
      <BuilderContent />
    </React.Suspense>
  );
}
