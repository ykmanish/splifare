'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion } from 'framer-motion';
import AppShell from '@/components/layout/AppShell';
import { useApp } from '@/store/AppContext';

function Booting() {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas">
      <div className="flex flex-col items-center gap-5">
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          {/* The real app icon, not the drawn mark — the boot screen should
              show the same thing as the home-screen tile it launched from. */}
          <Image
            src="/icon.png"
            alt=""
            width={72}
            height={72}
            priority
            className="size-18 rounded-[22px]"
          />
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
