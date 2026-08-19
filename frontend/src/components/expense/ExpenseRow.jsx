'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ShoppingBasket } from 'lucide-react';
import { IconTile, RowMenu } from '@/components/ui/Bits';
import { GroupLabel, ListGroup } from '@/components/ui/Blocks';
import { ConfirmSheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { categoryOf } from '@/lib/categories';
import { money, dayLabel, firstName } from '@/lib/format';
import { shareOf } from '@/lib/balances';
import { canEditExpense } from '@/lib/permissions';
import { useApp } from '@/store/AppContext';
import { useUI } from '@/components/layout/AppShell';

const EASE = [0.16, 1, 0.3, 1];

/**
 * One expense as a FieldRow-shaped row: category tile · description /
 * subtitle · your share · the edit-delete menu.
 */
export function ExpenseRow({ expense, showGroup = false }) {
  const { me, personById, groups, currency, deleteExpense } = useApp();
  const { editExpense } = useUI();
  const { toast } = useToast();

  const [confirm, setConfirm] = useState(false);

  const cat = categoryOf(expense.category);
  const Icon = expense.listId ? ShoppingBasket : cat.icon;
  const payer = personById(expense.paidBy?.[0]?.userId);
  const isMe = payer?.id === me?.id;
  const { net } = shareOf(expense, me?.id);
  const group = groups.find((g) => g.id === expense.groupId);
  // Offered only to whoever entered it; the server enforces the same rule.
  const mine = canEditExpense(expense, me?.id);


  // A single expense is exact in the currency it was recorded in. Formatting
  // a €40 dinner with the viewer's ₹ symbol would just be a lie.
  const own = expense.currency || currency;

  const sub = [
    isMe
      ? `You paid ${money(expense.amount, own)}`
      : `${firstName(payer?.name)} paid ${money(expense.amount, own)}`,
    expense.items?.length
      ? `${expense.items.length} ${expense.items.length === 1 ? 'item' : 'items'}`
      : null,
    showGroup && group ? group.name : null,
  ]
    .filter(Boolean)
    .join(' · ');

  async function onDelete() {
    try {
      await deleteExpense(expense.id);
      toast({ tone: 'info', title: 'Expense deleted', description: expense.description });
    } catch (err) {
      toast({ tone: 'error', title: 'Could not delete', description: err.message });
    }
  }

  return (
    <>
      <div className="flex w-full items-center gap-2 px-4 py-3.5">
        <motion.button
          type="button"
          whileTap={{ scale: 0.985 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          onClick={() => editExpense(expense)}
          className="flex min-w-0 flex-1 items-center gap-3.5 text-left tap"
        >
          <IconTile icon={Icon} tint={cat.tint} size="md" />

          <span className="min-w-0 flex-1">
            <span className="newq  text-ink block truncate text-[15px]">{expense.description}</span>
            <span className="newq block truncate text-[12.5px]">{sub}</span>
          </span>

          <span className="shrink-0 text-right">
            {Math.abs(net) < 0.005 ? (
              <span className="newq block text-[12.5px]">not involved</span>
            ) : (
              <>
                <span
                  className={`num block text-[15.5px]  ${net > 0 ? 'text-pos' : 'text-neg'}`}
                >
                  {money(Math.abs(net), own)}
                </span>
                <span className="newq block text-[11.5px]">{net > 0 ? 'you lent' : 'you owe'}</span>
              </>
            )}
          </span>
        </motion.button>

        {mine && (
          <RowMenu
            onEdit={() => editExpense(expense)}
            onDelete={() => setConfirm(true)}
            editLabel="Edit expense"
            deleteLabel="Delete expense"
            title={expense.description}
            subtitle={sub}
          />
        )}
      </div>

      <ConfirmSheet
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={onDelete}
        title="Delete this expense?"
        body={`“${expense.description}” will be removed for everyone it was split with. This cannot be undone.`}
        confirmLabel="Delete"
        danger
      />
    </>
  );
}

/** Expense feed grouped by day — a GroupLabel + ListGroup per day. */
export function ExpenseList({ expenses, showGroup = false, className = '' }) {
  const groupsByDay = expenses.reduce((acc, e) => {
    const key = dayLabel(e.date);
    (acc[key] = acc[key] || []).push(e);
    return acc;
  }, {});

  return (
    <div className={`space-y-6 ${className}`}>
      {Object.entries(groupsByDay).map(([day, items], i) => (
        <motion.div
          key={day}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE, delay: i * 0.04 }}
        >
          <GroupLabel
            action={
              <span className="newq text-[12px]">
                {items.length} {items.length === 1 ? 'expense' : 'expenses'}
              </span>
            }
          >
            {day}
          </GroupLabel>

          <ListGroup>
            {items.map((e) => (
              <ExpenseRow key={e.id} expense={e} showGroup={showGroup} />
            ))}
          </ListGroup>
        </motion.div>
      ))}
    </div>
  );
}
