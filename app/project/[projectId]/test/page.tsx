'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

export default function TestAlias({ params }: { params: Promise<{ projectId: string }> }) {
  const router = useRouter();
  React.useEffect(() => {
    params.then(p => router.replace(`/project/${p.projectId}?tab=simulator`));
  }, [params, router]);
  return <p className="py-24 text-center text-[13px] text-graphite">Opening simulator…</p>;
}
