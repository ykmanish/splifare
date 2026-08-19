'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Check, Plus, ShoppingBasket, Store } from 'lucide-react';
import Page from '@/components/layout/Page';
import Button from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/Sheet';
import { Badge, Card, cycleTone, EmptyState, Progress, RowMenu } from '@/components/ui/Bits';
import { CoralFab, GroupLabel } from '@/components/ui/Blocks';
import { Pills } from '@/components/ui/Controls';
import CreateListSheet from '@/components/lists/CreateListSheet';
import { useApp } from '@/store/AppContext';
import { useToast } from '@/components/ui/Toast';
import { money } from '@/lib/format';

const EASE = [0.16, 1, 0.3, 1];
const SPRING = { type: 'spring', damping: 26, stiffness: 320 };

const rise = (i = 0) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: EASE, delay: i * 0.04 },
});

/* ------------------------------------------------------------------ */

/**
 * One list as a pastel card: emoji disc · name · store · pick progress · spend.
 * `tone` is cycled by the caller so consecutive lists never share a fill;
 * a checked-out list always goes mint, the "settled / done" colour.
 */
function ListCard({ list, currency, tone, onEdit, onDelete }) {
  const done = list.items.filter((i) => i.checked).length;
  const spent = list.items.reduce((a, i) => a + (Number(i.price) || 0), 0);
  const completed = list.status === 'completed';
  const shopping = list.status === 'shopping';
  const href = shopping ? `/lists/${list.id}/shop` : `/lists/${list.id}`;

  return (
    <Card as={Link} href={href} tone={completed ? 'mint' : tone} className="block tap">
      <div className="flex items-start gap-3.5">
        <span className="grid size-12 shrink-0 place-items-center rounded-[16px] bg-white/70 dark:bg-white/10 text-[22px] leading-none">
          {list.emoji}
        </span>

        <span className="min-w-0 flex-1 pt-0.5">
          <span className="newq  text-ink block truncate text-[16px]">{list.name}</span>
          <span className="newq mt-0.5 block truncate text-[12.5px]">
            {list.store || 'No store set'}
          </span>
        </span>

        <span className="-mr-1.5 flex shrink-0 items-center gap-1">
          {shopping && (
            <Badge tone="dark" icon={Store}>
              Shopping
            </Badge>
          )}
          {completed && (
            <Badge tone="onTone" icon={Check}>
              Done
            </Badge>
          )}
          <RowMenu
            title={list.name}
            subtitle={`${list.items.length} ${list.items.length === 1 ? 'item' : 'items'} · ${
              list.store || 'No store set'
            }`}
            editLabel="List settings"
            deleteLabel="Delete list"
            className="!text-ink"
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </span>
      </div>

      <div className="mt-4 flex items-end justify-between gap-4">
        <span className="min-w-0 flex-1">
          <Progress value={done} max={list.items.length || 1} tone="dark" />
          <span className="newq mt-2 block text-[12px]">
            {done}/{list.items.length} picked
          </span>
        </span>

        <span className="newq  text-ink num shrink-0 text-[18px] leading-none">
          {spent > 0 ? money(spent, currency) : '—'}
        </span>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function ListsInner() {
  const { lists, currency, deleteList } = useApp();
  const { toast } = useToast();
  const router = useRouter();
  const params = useSearchParams();

  const [creating, setCreating] = useState(params.get('new') === '1');
  const [tab, setTab] = useState('active');
  const [pendingDelete, setPendingDelete] = useState(null);

  const active = lists.filter((l) => l.status !== 'completed');
  const done = lists.filter((l) => l.status === 'completed');
  const shown = tab === 'active' ? active : done;

  /** Settings live on the list itself, so edit opens that sheet in place. */
  const openSettings = (l) => router.push(`/lists/${l.id}?edit=1`);

  async function removeList() {
    const target = pendingDelete;
    if (!target) return;
    try {
      await deleteList(target.id);
      toast({ tone: 'info', title: 'List deleted', description: target.name });
    } catch (err) {
      toast({ tone: 'error', title: 'Could not delete the list', description: err.message });
    }
  }

  return (
    <Page title="Shopping lists">
      <div className="space-y-6">
        {/* ------------------------------------------------ explainer */}
        <motion.div {...rise(0)}>
          <Card tone="sky">
            <div className="flex items-start gap-3.5">
              <span className="grid size-11 shrink-0 place-items-center rounded-[16px] bg-white/70 dark:bg-white/10 text-ink">
                <Store size={19} strokeWidth={2.2} />
              </span>
              <div className="min-w-0">
                <p className="newq  text-ink text-[15px]">How this works</p>
                <p className="newq mt-1.5 text-[13px] leading-relaxed">
                  Build the list at home and say who each item is for. At the store, tick things off
                  and type the real price. Checkout turns the trip into one expense, split per item.
                </p>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* ------------------------------------------------ tabs */}
        <motion.div {...rise(1)}>
          <Pills
            options={[
              { id: 'active', label: `Active (${active.length})` },
              { id: 'done', label: `Completed (${done.length})` },
            ]}
            value={tab}
            onChange={setTab}
          />
        </motion.div>

        {/* ------------------------------------------------ lists */}
        <section>
          <motion.div {...rise(2)}>
            <GroupLabel
              action={
                <span className="newq text-[12px]">
                  {shown.length} {shown.length === 1 ? 'list' : 'lists'}
                </span>
              }
            >
              {tab === 'active' ? 'Active' : 'Completed'}
            </GroupLabel>
          </motion.div>

          {shown.length === 0 ? (
            <motion.div {...rise(3)}>
              <Card tone="lavenderSoft" pad={false}>
                <EmptyState
                  icon={ShoppingBasket}
                  title={tab === 'active' ? 'No active lists' : 'Nothing completed yet'}
                  body={
                    tab === 'active'
                      ? 'Start a list before your next shop and split it item by item.'
                      : 'Lists you check out will be archived here.'
                  }
                  action={
                    tab === 'active' ? (
                      <Button variant="dark" icon={Plus} onClick={() => setCreating(true)}>
                        New list
                      </Button>
                    ) : undefined
                  }
                />
              </Card>
            </motion.div>
          ) : (
            <div className="space-y-3">
              {shown.map((l, i) => (
                <motion.div key={l.id} {...rise(2 + i)}>
                  <motion.div whileTap={{ scale: 0.985 }} transition={SPRING}>
                    <ListCard
                      list={l}
                      currency={currency}
                      tone={cycleTone(i)}
                      onEdit={() => openSettings(l)}
                      onDelete={() => setPendingDelete(l)}
                    />
                  </motion.div>
                </motion.div>
              ))}
            </div>
          )}
        </section>

        {/* ------------------------------------------------ archive peek */}
        {tab === 'active' && done.length > 0 && (
          <section>
            <motion.div {...rise(3)}>
              <GroupLabel>Recently completed</GroupLabel>
            </motion.div>
            <div className="space-y-3">
              {done.slice(0, 2).map((l, i) => (
                <motion.div key={l.id} {...rise(3 + i)}>
                  <motion.div whileTap={{ scale: 0.985 }} transition={SPRING}>
                    <ListCard
                      list={l}
                      currency={currency}
                      tone="mint"
                      onEdit={() => openSettings(l)}
                      onDelete={() => setPendingDelete(l)}
                    />
                  </motion.div>
                </motion.div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ------------------------------------------------ the one CTA */}
      {/* fixed inside the phone column — never wrapped in an animated transform */}
      <div
        className="phone pointer-events-none fixed inset-x-0 z-40 flex justify-end px-5"
        style={{ bottom: 'calc(5.25rem + env(safe-area-inset-bottom))' }}
      >
        <CoralFab
          icon={Plus}
          label="New list"
          onClick={() => setCreating(true)}
          className="pointer-events-auto"
        />
      </div>

      <CreateListSheet open={creating} onClose={() => setCreating(false)} />

      <ConfirmSheet
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title={pendingDelete ? `Delete ${pendingDelete.name}?` : 'Delete list?'}
        body="The list and its items will be removed. Any expense already created from it stays."
        confirmLabel="Delete list"
        danger
        onConfirm={removeList}
      />
    </Page>
  );
}

export default function ListsPage() {
  return (
    <Suspense fallback={null}>
      <ListsInner />
    </Suspense>
  );
}
