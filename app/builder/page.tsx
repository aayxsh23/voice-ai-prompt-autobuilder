'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function BuilderRootPage() {
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

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-32 text-center">
      {failed ? (
        <>
          <p className="text-[14px] text-ink">Could not start a session.</p>
          <button type="button" onClick={() => window.location.reload()} className="btn btn-secondary">
            Try again
          </button>
        </>
      ) : (
        <p className="flex items-center gap-2 text-[13px] text-graphite">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Starting session…
        </p>
      )}
    </div>
  );
}
