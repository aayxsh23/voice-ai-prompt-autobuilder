'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

export default function VerAlias({ params }: { params: Promise<{ projectId: string }> }) {
  const router = useRouter();
  React.useEffect(() => {
    params.then(p => router.replace(`/project/${p.projectId}?tab=versions`));
  }, [params, router]);
  return <div className="p-12 text-center text-slate-500">Opening version snapshots...</div>;
}
