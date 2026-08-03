'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

export default function VerAlias({ params }: { params: Promise<{ projectId: string }> }) {
  const router = useRouter();
  React.useEffect(() => {
    params.then(p => router.replace(`/project/${p.projectId}?tab=versions`));
  }, [params, router]);
  return <p className="py-24 text-center text-[13px] text-graphite">Opening versions…</p>;
}
