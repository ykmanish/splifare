'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Receipt,
  Wallet,
  ShoppingBasket,
  UsersRound,
  UserPlus,
  Trash2,
  Activity as ActivityIcon,
} from 'lucide-react';
import Page from '@/components/layout/Page';
import { useUI } from '@/components/layout/AppShell';
import Avatar from '@/components/ui/Avatar';
import { Card, EmptyState, RowMenu, Segmented } from '@/components/ui/Bits';
import { FieldRow, GroupLabel, ListGroup } from '@/components/ui/Blocks';
import { ConfirmSheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { useApp } from '@/store/AppContext';
import { canEditExpense } from '@/lib/permissions';
import { money, dayLabel, relativeTime } from '@/lib/format';

const EASE = [0.16, 1, 0.3, 1];

const KIND = {
  expense_added: { icon: Receipt, tint: 'var(--pos)' },
  expense_deleted: { icon: Trash2, tint: 'var(--neg)' },
  settle: { icon: Wallet, tint: 'var(--info)' },
  list_created: { icon: ShoppingBasket, tint: 'var(--brand)' },
  list_shared: { icon: ShoppingBasket, tint: 'var(--brand)' },
  list_completed: { icon: ShoppingBasket, tint: 'var(--brand)' },
  group_created: { icon: UsersRound, tint: 'var(--warn)' },
  friend_added: { icon: UserPlus, tint: 'var(--brand)' },
};

/**
 * Renders the **bold** segments the store writes into activity text.
 * Plain runs carry .newq so they stay body-weight inside the .small row label.
 */
function RichText({ text }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') ? (
          <span key={i} className="newq  text-ink">
            {p.slice(2, -2)}
          </span>
        ) : (
          <span key={i} className="newq">
            {p}
          </span>
        ),
      )}
    </>
  );
}

function routeFor(a) {
  switch (a.entityType) {
    case 'group':
      return `/groups/${a.entityId}`;
    case 'friend':
      return `/friends/${a.entityId}`;
    case 'list':
      return `/lists/${a.entityId}`;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ row */

function FeedRow({ item, actor, currency, href, menu }) {
  const kind = KIND[item.type] || KIND.expense_added;

  /* The actor's face is the leading element; the type glyph rides its corner.
     Memoised so FieldRow keeps the same component identity and the avatar
     image never remounts between renders. */
  const Leading = useMemo(() => {
    const Glyph = kind.icon;
    return function Leading() {
      return (
        <span className="relative block size-9">
          <Avatar person={actor} size="sm" />
          <span
            className="absolute -bottom-0.5 -right-0.5 grid size-[18px] place-items-center
              rounded-full ring-2 ring-surface"
            style={{ background: kind.tint, color: '#fff' }}
          >
            <Glyph size={10} strokeWidth={2.8} />
          </span>
        </span>
      );
    };
  }, [actor, kind]);

  /* Each feed row stores the currency its figure happened in. Rows written
     before that field existed fall back to the viewer's currency, which is
     what they were recorded in at the time. */
  const amountLabel =
    item.amount != null ? money(item.amount, item.currency || currency) : undefined;

  return (
    <FieldRow
      icon={Leading}
      iconBg="transparent"
      href={href || undefined}
      label={
        <span className="block whitespace-normal leading-snug">
          <RichText text={item.text} />
        </span>
      }
      sublabel={relativeTime(item.createdAt)}
      value={amountLabel}
      trailing={
        menu ? (
          /* RowMenu's sheet is portalled but still a React child of this row,
             so its clicks would otherwise bubble into the row's navigation. */
          <span onClick={(e) => e.stopPropagation()}>
            <RowMenu {...menu} className="-mr-1.5" />
          </span>
        ) : undefined
      }
    />
  );
}

/* ------------------------------------------------------------------ page */

export default function ActivityPage() {
  const {
    me,
    activity,
    personById,
    currency,
    expenses,
    groups,
    lists,
    people,
    deleteExpense,
    deleteGroup,
    deleteList,
    removeFriend,
  } = useApp();
  const { editExpense } = useUI();
  const { toast } = useToast();
  const router = useRouter();

  const [filter, setFilter] = useState('all');
  const [confirm, setConfirm] = useState(null);

  const filtered = useMemo(() => {
    if (filter === 'all') return activity;
    if (filter === 'expenses')
      return activity.filter((a) => a.type.startsWith('expense'));
    if (filter === 'payments') return activity.filter((a) => a.type === 'settle');
    return activity.filter((a) => a.type.startsWith('list'));
  }, [activity, filter]);

  const byDay = useMemo(() => {
    return filtered.reduce((acc, a) => {
      const key = dayLabel(a.createdAt);
      (acc[key] = acc[key] || []).push(a);
      return acc;
    }, {});
  }, [filtered]);

  /** The still-existing thing an entry points at, so edit/delete act on it. */
  function targetFor(a) {
    if (a.entityType === 'expense') {
      const e = expenses.find((x) => x.id === a.entityId);
      return e && { kind: 'expense', label: 'Expense', name: e.description, entity: e };
    }
    if (a.entityType === 'group') {
      const g = groups.find((x) => x.id === a.entityId);
      return g && { kind: 'group', label: 'Group', name: g.name, entity: g };
    }
    if (a.entityType === 'list') {
      const l = lists.find((x) => x.id === a.entityId);
      return l && { kind: 'list', label: 'Shopping list', name: l.name, entity: l };
    }
    if (a.entityType === 'friend') {
      const p = people.find((x) => x.id === a.entityId);
      return p && { kind: 'friend', label: 'Friend', name: p.name, entity: p };
    }
    return null;
  }

  function menuFor(a) {
    const t = targetFor(a);
    if (!t) return null;

    const base = { title: t.name, subtitle: t.label };

    if (t.kind === 'expense') {
      // Someone else's expense gets no edit or delete here either; the row
      // still opens it, read-only.
      if (!canEditExpense(t.entity, me?.id)) return null;
      return {
        ...base,
        editLabel: 'Edit expense',
        deleteLabel: 'Delete expense',
        onEdit: () => editExpense(t.entity),
        onDelete: () =>
          setConfirm({
            title: 'Delete this expense?',
            body: `“${t.name}” will be removed for everyone it was split with.`,
            confirmLabel: 'Delete expense',
            done: 'Expense deleted',
            run: () => deleteExpense(t.entity.id),
          }),
      };
    }

    if (t.kind === 'group') {
      return {
        ...base,
        editLabel: 'Open group',
        deleteLabel: 'Delete group',
        onEdit: () => router.push(`/groups/${t.entity.id}`),
        onDelete: () =>
          setConfirm({
            title: `Delete ${t.name}?`,
            body: 'The group and every expense inside it will be removed.',
            confirmLabel: 'Delete group',
            done: 'Group deleted',
            run: () => deleteGroup(t.entity.id),
          }),
      };
    }

    if (t.kind === 'list') {
      return {
        ...base,
        editLabel: 'Open list',
        deleteLabel: 'Delete list',
        onEdit: () => router.push(`/lists/${t.entity.id}`),
        onDelete: () =>
          setConfirm({
            title: `Delete ${t.name}?`,
            body: 'Every item on this shopping list goes with it.',
            confirmLabel: 'Delete list',
            done: 'List deleted',
            run: () => deleteList(t.entity.id),
          }),
      };
    }

    return {
      ...base,
      editLabel: 'Open friend',
      deleteLabel: 'Remove friend',
      onEdit: () => router.push(`/friends/${t.entity.id}`),
      onDelete: () =>
        setConfirm({
          title: `Remove ${t.name}?`,
          body: 'They stay on shared expenses, but drop off your friend list.',
          confirmLabel: 'Remove friend',
          done: 'Friend removed',
          run: () => removeFriend(t.entity.id),
        }),
    };
  }

  async function runConfirm() {
    if (!confirm) return;
    try {
      await confirm.run();
      toast({ title: confirm.done });
    } catch (err) {
      toast({
        tone: 'error',
        title: 'That did not go through',
        description: err.message,
      });
    }
  }

  return (
    <Page title="Activity">
      <div className="space-y-6">
        <Segmented
          options={[
            { id: 'all', label: 'All' },
            { id: 'expenses', label: 'Expenses' },
            { id: 'payments', label: 'Payments' },
            { id: 'lists', label: 'Lists' },
          ]}
          value={filter}
          onChange={setFilter}
        />

        {filtered.length === 0 ? (
          <Card tone="white" pad={false}>
            <EmptyState
              icon={ActivityIcon}
              title="Nothing here yet"
              body="Everything you and your groups do will show up in this feed."
            />
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(byDay).map(([day, items], gi) => (
              <motion.section
                key={day}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: EASE, delay: gi * 0.04 }}
              >
                <GroupLabel>{day}</GroupLabel>

                <ListGroup>
                  {items.map((a) => (
                    <FeedRow
                      key={a.id}
                      item={a}
                      actor={personById(a.actorId)}
                      currency={currency}
                      href={routeFor(a)}
                      menu={menuFor(a)}
                    />
                  ))}
                </ListGroup>
              </motion.section>
            ))}
          </div>
        )}
      </div>

      <ConfirmSheet
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.title}
        body={confirm?.body}
        confirmLabel={confirm?.confirmLabel || 'Delete'}
        onConfirm={runConfirm}
        danger
      />
    </Page>
  );
}
