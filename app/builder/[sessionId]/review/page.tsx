'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

export default function ReviewRouteAlias({ params }: { params: Promise<{ sessionId: string }> }) {
  const router = useRouter();

  React.useEffect(() => {
    params.then(p => {
      router.replace(`/builder/${p.sessionId}`);
    });
  }, [params, router]);

  return <div className="p-20 text-center text-slate-500">Redirecting to session review stepper...</div>;
}
