'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import AppShell from '@/components/layout/AppShell';
import { useApp } from '@/store/AppContext';
import { LogoMark } from '@/components/Logo';

function Booting() {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas">
      <div className="flex flex-col items-center gap-5">
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <LogoMark size={52} />
        </motion.div>
        <p className="newq text-[13.5px]">Loading your balances…</p>
      </div>
    </div>
  );
}

export default function AppLayout({ children }) {
  const { ready, session } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (ready && !session) router.replace('/login');
  }, [ready, session, router]);

  if (!ready || !session) return <Booting />;

  return <AppShell>{children}</AppShell>;
}
