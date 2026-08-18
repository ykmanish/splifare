'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/store/AppContext';

export default function AuthLayout({ children }) {
  const { ready, session } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (ready && session) router.replace('/dashboard');
  }, [ready, session, router]);

  return (
    <div className="min-h-dvh bg-canvas">
      <div className="phone flex min-h-dvh flex-col pb-safe">
        <main className="flex-1 px-5 pb-12 pt-18">{children}</main>
      </div>
    </div>
  );
}
