'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

export default function TestAlias({ params }: { params: Promise<{ projectId: string }> }) {
  const router = useRouter();
  React.useEffect(() => {
    params.then(p => router.replace(`/project/${p.projectId}?tab=simulator`));
  }, [params, router]);
  return <div className="p-12 text-center text-slate-500">Opening simulator...</div>;
}
