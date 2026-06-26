'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

export default function ProjectsRouteAlias({ params }: { params: Promise<{ projectId: string }> }) {
  const router = useRouter();

  React.useEffect(() => {
    params.then(p => {
      router.replace(`/project/${p.projectId}`);
    });
  }, [params, router]);

  return <div className="p-20 text-center text-[#62666d]">Redirecting to studio...</div>;
}
