'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import Logo from '@/components/Logo';
import Button from '@/components/ui/Button';
import { Card, Badge } from '@/components/ui/Bits';
import { AvatarCluster } from '@/components/ui/Blocks';
import Avatar from '@/components/ui/Avatar';
import { useApp } from '@/store/AppContext';
import { money, firstName } from '@/lib/format';

const EASE = [0.16, 1, 0.3, 1];
const rise = (i = 0) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: EASE, delay: i * 0.04 },
});

/* A tiny cast of illustrated friends for the hero. */
const CREW = [
  { id: 'preview-meera', name: 'Meera Nair' },
  { id: 'preview-rohan', name: 'Rohan Das' },
  { id: 'preview-aarav', name: 'Aarav Sharma' },
  { id: 'preview-ishaan', name: 'Ishaan Roy' },
];

/* ------------------------------------------------------------------ */

/**
 * The centred illustrative stack: a soft blob of faces with two small
 * bill cards drifting either side of it.
 */
function HeroStack() {
  return (
    <div className="relative mx-auto h-[264px] w-full max-w-[332px]">
      <div className="absolute inset-0 grid place-items-center">
        <AvatarCluster people={CREW} size={166} />
      </div>

      {/* black bill card — drifts top-left */}
      <div className="absolute left-0 top-1 w-[47%]" style={{ transform: 'rotate(-8deg)' }}>
        <div className="animate-float">
          <Card tone="panel" pad={false} className="rounded-[18px] p-3.5">
            <p className="newq text-[10.5px] text-white-2">Dinner at Thalassa</p>
            <p className="num mt-1 text-[21px]  leading-none text-white">
              {money(1784, 'INR')}
            </p>
            <p className="newq mt-1.5 text-[10.5px] text-white-2">split 3 ways</p>
          </Card>
        </div>
      </div>

      {/* grey settled card — drifts bottom-right */}
      <div className="absolute bottom-2 right-0 w-[53%]" style={{ transform: 'rotate(6deg)' }}>
        <div className="animate-float" style={{ animationDelay: '0.8s' }}>
          <Card tone="soft" pad={false} className="rounded-[18px] p-3.5">
            <div className="flex items-center gap-2">
              <Avatar person={CREW[1]} size="xs" />
              <span className="newq  text-ink min-w-0 flex-1 truncate text-[12px]">
                {firstName(CREW[1].name)}
              </span>
            </div>
            <p className="num mt-2 text-[19px]  leading-none text-ink">
              {money(595, 'INR')}
            </p>
            <div className="mt-2">
              <Badge tone="mint">Settled</Badge>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function LandingPage() {
  const { ready, session } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (ready && session) router.replace('/dashboard');
  }, [ready, session, router]);

  return (
    <div className="min-h-dvh bg-canvas">
      <div className="phone flex min-h-dvh flex-col px-5 pb-safe pt-6">
        <motion.div {...rise(0)}>
          <Logo size={28} />
        </motion.div>

        <div className="flex flex-1 flex-col justify-center py-8">
          <motion.div {...rise(1)}>
            <HeroStack />
          </motion.div>

          <motion.div {...rise(3)} className="mt-10 text-center">
            <h1 className="newq  text-ink text-[34px] leading-[1.1]">
              Split the bill with your friends
            </h1>
            <p className="newq mt-3.5 text-[15px] leading-relaxed">
              Track who paid for what across flatmates, trips and lunch runs — then clear
              everyone out in the fewest possible payments.
            </p>
          </motion.div>
        </div>

        <motion.div {...rise(5)} className="space-y-2.5 pb-10">
          <Button href="/signup" size="lg" block>
            Get started
          </Button>
          <Button href="/login" variant="soft" size="lg" block>
            I already have an account
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
