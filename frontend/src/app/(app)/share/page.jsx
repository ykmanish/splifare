'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Inbox, Plus, Receipt, ScanLine, Trash2 } from 'lucide-react';
import Page from '@/components/layout/Page';
import { useUI } from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import { Card, EmptyState } from '@/components/ui/Bits';
import { GroupLabel, ListGroup, FieldRow } from '@/components/ui/Blocks';
import { useApp } from '@/store/AppContext';
import { readSharedPayload, clearSharedPayload, parseSharedAmount, parseSharedDescription } from '@/lib/share';
import { money } from '@/lib/format';
import { api } from '@/lib/api';
import { prepareImage, ImageError } from '@/lib/image';
import { planFromScan } from '@/lib/scan';
import { useToast } from '@/components/ui/Toast';

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
  const [scanning, setScanning] = useState(false);
  const [canScan, setCanScan] = useState(false);
  const { toast } = useToast();

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

  // Only offered when the server can actually read a photo.
  useEffect(() => {
    let alive = true;
    api
      .scanStatus()
      .then((r) => alive && setCanScan(!!r.enabled))
      .catch(() => alive && setCanScan(false));
    return () => {
      alive = false;
    };
  }, []);

  const amount = payload ? parseSharedAmount(payload.text) : null;
  const description = payload ? parseSharedDescription(payload.text) : '';

  /**
   * Read the shared image into line items rather than guessing one number
   * out of the shared text.
   */
  async function readItems() {
    if (!payload?.blob || scanning) return;
    setScanning(true);
    try {
      const prepared = await prepareImage(payload.blob);
      const result = await api.scanReceipt({
        images: [{ mediaType: prepared.mediaType, data: prepared.base64 }],
        currency,
      });
      const plan = planFromScan(result, { currency });

      if (plan.action === 'reject') {
        toast({ tone: 'error', title: plan.title, description: plan.body });
        return;
      }

      await clearSharedPayload();
      if (plan.action === 'amount') {
        openExpense({
          amount: plan.amount,
          description: plan.description || description || undefined,
          currency: plan.currency || undefined,
        });
      } else {
        openExpense({
          itemized: true,
          items: plan.rows,
          description: plan.description || description || undefined,
          currency: plan.currency || undefined,
        });
      }
      router.replace('/dashboard');
    } catch (err) {
      toast({
        tone: 'error',
        title: 'Could not read that photo',
        description: err instanceof ImageError ? err.message : err.message,
      });
    } finally {
      setScanning(false);
    }
  }

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
              {canScan
                ? 'Read the items off it below. The photo itself is never saved — only what it says.'
                : 'Held on this device only. Read the total off it and type it in below.'}
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

        {canScan && payload.blob && (
          <Button
            size="lg"
            block
            icon={ScanLine}
            loading={scanning}
            disabled={scanning}
            onClick={readItems}
          >
            {scanning ? 'Reading the items…' : 'Read the items from this photo'}
          </Button>
        )}

        <div className="flex gap-2.5">
          <Button variant="soft" size="md" icon={Trash2} className="flex-1" onClick={discard}>
            Discard
          </Button>
          <Button
            variant={canScan && payload.blob ? 'soft' : 'primary'}
            size="md"
            icon={Plus}
            className="flex-[2]"
            onClick={useIt}
          >
            Add as expense
          </Button>
        </div>
      </motion.div>
    </Page>
  );
}
