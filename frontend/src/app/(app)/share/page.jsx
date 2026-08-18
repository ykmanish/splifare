'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Inbox, Plus, Receipt, Trash2 } from 'lucide-react';
import Page from '@/components/layout/Page';
import { useUI } from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import { Card, EmptyState } from '@/components/ui/Bits';
import { GroupLabel, ListGroup, FieldRow } from '@/components/ui/Blocks';
import { useApp } from '@/store/AppContext';
import { readSharedPayload, clearSharedPayload, parseSharedAmount, parseSharedDescription } from '@/lib/share';
import { money } from '@/lib/format';

const EASE = [0.16, 1, 0.3, 1];

/**
 * Where an OS share lands.
 *
 * The service worker has already parked the payload in Cache Storage, so this
 * screen reads it, shows what arrived, and offers to turn it into an expense
 * with the amount already filled in.
 */
export default function SharePage() {
  const { currency } = useApp();
  const { openExpense } = useUI();
  const router = useRouter();

  const [payload, setPayload] = useState(null);
  const [imageUrl, setImageUrl] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stopped = false;
    let url = '';

    (async () => {
      const got = await readSharedPayload();
      if (stopped) return;
      setPayload(got);
      if (got?.blob) {
        url = URL.createObjectURL(got.blob);
        setImageUrl(url);
      }
      setLoading(false);
    })();

    return () => {
      stopped = true;
      // A blob URL pins the image in memory until it is revoked.
      if (url) URL.revokeObjectURL(url);
    };
  }, []);

  const amount = payload ? parseSharedAmount(payload.text) : null;
  const description = payload ? parseSharedDescription(payload.text) : '';

  async function useIt() {
    // Cleared before the sheet opens, so a back-navigation cannot replay it.
    await clearSharedPayload();
    openExpense({
      amount: amount || undefined,
      description: description || undefined,
    });
    router.replace('/dashboard');
  }

  async function discard() {
    await clearSharedPayload();
    router.replace('/dashboard');
  }

  if (loading) return <Page title="Shared" />;

  if (!payload) {
    return (
      <Page title="Shared">
        <Card tone="skySoft" pad={false}>
          <EmptyState
            icon={Inbox}
            title="Nothing shared"
            body="Share a payment message or a receipt into Splitta from another app and it will show up here."
            action={
              <Button variant="dark" href="/dashboard">
                Back to home
              </Button>
            }
          />
        </Card>
      </Page>
    );
  }

  return (
    <Page title="Shared with Splitta">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="space-y-6"
      >
        {imageUrl && (
          <div>
            <GroupLabel>Image</GroupLabel>
            <Card tone="soft" pad={false} className="overflow-hidden">
              {/* A plain img: this is a blob URL, which next/image cannot
                  optimise and does not need to. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={payload.name || 'Shared image'}
                className="max-h-[52dvh] w-full object-contain"
              />
            </Card>
            <p className="newq mt-2 px-1.5 text-[12px]">
              Held on this device only — Splitta cannot attach images to an expense yet, so read
              the total off it and it goes in below.
            </p>
          </div>
        )}

        {payload.text && (
          <div>
            <GroupLabel>Shared text</GroupLabel>
            <Card tone="soft">
              <p className="newq whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">
                {payload.text}
              </p>
            </Card>
          </div>
        )}

        <div>
          <GroupLabel>What Splitta read</GroupLabel>
          <ListGroup>
            <FieldRow
              icon={Receipt}
              label={amount ? money(amount, currency) : 'No amount found'}
              sublabel={amount ? 'Pre-filled as the total' : 'You can type it in yourself'}
            />
            {description && (
              <FieldRow label={description} sublabel="Pre-filled as the description" />
            )}
          </ListGroup>
        </div>

        <div className="flex gap-2.5">
          <Button variant="soft" size="md" icon={Trash2} className="flex-1" onClick={discard}>
            Discard
          </Button>
          <Button size="md" icon={Plus} className="flex-[2]" onClick={useIt}>
            Add as expense
          </Button>
        </div>
      </motion.div>
    </Page>
  );
}
