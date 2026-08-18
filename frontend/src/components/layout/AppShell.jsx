'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import BottomNav from './BottomNav';
import NotificationPanel from './NotificationPanel';
import AddExpenseSheet from '@/components/expense/AddExpenseSheet';
import SettleUpSheet from '@/components/groups/SettleUpSheet';

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

  const value = useMemo(
    () => ({
      openExpense: (prefill = {}) => setExpense({ prefill }),
      editExpense: (e) => setExpense({ editing: e }),
      openSettle: (prefill = {}) => setSettle(prefill),
      openNotifications: () => setNotifOpen(true),
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

      <AddExpenseSheet
        open={!!expense}
        onClose={closeExpense}
        prefill={expense?.prefill}
        editing={expense?.editing}
      />

      <SettleUpSheet open={!!settle} onClose={closeSettle} prefill={settle || {}} />
    </UICtx.Provider>
  );
}
