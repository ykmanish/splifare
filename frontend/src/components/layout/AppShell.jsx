'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import BottomNav from './BottomNav';
import NotificationPanel from './NotificationPanel';
import AddExpenseSheet from '@/components/expense/AddExpenseSheet';
import SettleUpSheet from '@/components/groups/SettleUpSheet';
import UpdateSheet from '@/components/ui/UpdateSheet';

const UICtx = createContext(null);

export function useUI() {
  const ctx = useContext(UICtx);
  if (!ctx) throw new Error('useUI must be used inside <AppShell>');
  return ctx;
}

/**
 * Phone-first shell. On wide screens we centre a phone-width column
 * rather than growing into a desktop layout — this app is mobile only.
 */
export default function AppShell({ children }) {
  const [expense, setExpense] = useState(null);
  const [settle, setSettle] = useState(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);

  const value = useMemo(
    () => ({
      openExpense: (prefill = {}) => setExpense({ prefill }),
      /*
       * Two doors onto one expense. Tapping a row reads it; editing is a
       * deliberate second choice from the row menu. Opening a bill everyone
       * has already agreed to straight into an editable form makes a stray
       * tap look exactly like the start of a change.
       */
      viewExpense: (e) => setExpense({ editing: e, mode: 'view' }),
      editExpense: (e) => setExpense({ editing: e, mode: 'edit' }),
      openSettle: (prefill = {}) => setSettle(prefill),
      openNotifications: () => setNotifOpen(true),
      openUpdate: () => setUpdateOpen(true),
    }),
    [],
  );

  const closeExpense = useCallback(() => setExpense(null), []);
  const closeSettle = useCallback(() => setSettle(null), []);

  return (
    <UICtx.Provider value={value}>
      <div className="min-h-dvh overscroll-none bg-canvas">
        <div className="phone relative min-h-dvh overscroll-none bg-canvas">
          {children}
          <BottomNav onAddExpense={() => value.openExpense()} />
        </div>
      </div>

      <NotificationPanel open={notifOpen} onClose={() => setNotifOpen(false)} />

      <UpdateSheet open={updateOpen} onClose={() => setUpdateOpen(false)} />

      <AddExpenseSheet
        open={!!expense}
        onClose={closeExpense}
        prefill={expense?.prefill}
        editing={expense?.editing}
        openMode={expense?.mode}
        // Switching in place: the view already has the expense, so moving to
        // the form is a mode change rather than a close-and-reopen.
        onEdit={(e) => setExpense({ editing: e, mode: 'edit' })}
      />

      <SettleUpSheet open={!!settle} onClose={closeSettle} prefill={settle || {}} />
    </UICtx.Provider>
  );
}
