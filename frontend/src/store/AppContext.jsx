'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname } from 'next/navigation';
import {
  api,
  getToken,
  setToken,
  normUser,
  normGroup,
  normExpense,
  normSettlement,
  normList,
  normNotification,
  normActivity,
} from '@/lib/api';
import { buildLedger, balancesFor } from '@/lib/balances';
import { round2 } from '@/lib/format';

const THEME_KEY = 'splitta.theme';
const AppCtx = createContext(null);

/**
 * Paint the saved theme as soon as this module evaluates — before React
 * renders — so dark-mode users do not get a light flash.
 */
function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  document.documentElement.style.backgroundColor = dark ? '#08090a' : '#e9ebec';
  document.body.style.backgroundColor = dark ? '#08090a' : '#e9ebec';

  const themeColor = dark ? '#08090a' : '#e9ebec';
  const themeMetas = [...document.querySelectorAll('meta[name="theme-color"]')];
  if (!themeMetas.length) {
    const themeMeta = document.head.appendChild(document.createElement('meta'));
    themeMeta.setAttribute('name', 'theme-color');
    themeMetas.push(themeMeta);
  }
  themeMetas.forEach((meta) => {
    meta.setAttribute('content', themeColor);
    meta.removeAttribute('media');
  });

  const appleStatusMeta =
    document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]') ||
    document.head.appendChild(document.createElement('meta'));
  appleStatusMeta.setAttribute('name', 'apple-mobile-web-app-status-bar-style');
  appleStatusMeta.setAttribute('content', dark ? 'black-translucent' : 'default');
}

function syncThemeChrome(theme) {
  applyTheme(theme);
  requestAnimationFrame(() => applyTheme(theme));
  setTimeout(() => applyTheme(theme), 120);
}

if (typeof window !== 'undefined') {
  try {
    applyTheme(localStorage.getItem(THEME_KEY) || 'system');
  } catch {
    /* private mode */
  }
}

const EMPTY = {
  people: [],
  groups: [],
  expenses: [],
  settlements: [],
  lists: [],
  notifications: [],
  activity: [],
};

export function AppProvider({ children }) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState(null);
  const [data, setData] = useState(EMPTY);
  const [syncing, setSyncing] = useState(false);
  const [offline, setOffline] = useState(false);

  const patchData = useCallback((patch) => setData((d) => ({ ...d, ...patch })), []);

  /* ---------------------------------------------------- loading */

  const loadAll = useCallback(async () => {
    setSyncing(true);
    try {
      const [people, groups, expenses, settlements, lists, notifications, activity] =
        await Promise.all([
          api.people(),
          api.groups(),
          api.expenses(),
          api.settlements(),
          api.lists(),
          api.notifications(),
          api.activity(),
        ]);

      setData({
        people: people.people.map(normUser),
        groups: groups.groups.map(normGroup),
        expenses: expenses.expenses.map(normExpense),
        settlements: settlements.settlements.map(normSettlement),
        lists: lists.lists.map(normList),
        notifications: notifications.notifications.map(normNotification),
        activity: activity.activity.map(normActivity),
      });
      setOffline(false);
    } catch (err) {
      if (err.status === 401) {
        setToken(null);
        setMe(null);
        setData(EMPTY);
      } else {
        setOffline(true);
      }
      throw err;
    } finally {
      setSyncing(false);
    }
  }, []);

  /** Refresh only the slices an action touched. */
  const refresh = useCallback(
    async (keys = ['expenses', 'settlements', 'notifications', 'activity']) => {
      const jobs = {
        people: () => api.people().then((r) => ({ people: r.people.map(normUser) })),
        groups: () => api.groups().then((r) => ({ groups: r.groups.map(normGroup) })),
        expenses: () => api.expenses().then((r) => ({ expenses: r.expenses.map(normExpense) })),
        settlements: () =>
          api.settlements().then((r) => ({ settlements: r.settlements.map(normSettlement) })),
        lists: () => api.lists().then((r) => ({ lists: r.lists.map(normList) })),
        notifications: () =>
          api.notifications().then((r) => ({
            notifications: r.notifications.map(normNotification),
          })),
        activity: () => api.activity().then((r) => ({ activity: r.activity.map(normActivity) })),
      };
      const results = await Promise.all(keys.filter((k) => jobs[k]).map((k) => jobs[k]()));
      patchData(Object.assign({}, ...results));
    },
    [patchData],
  );

  /* ---------------------------------------------------- boot */

  useEffect(() => {
    (async () => {
      if (!getToken()) {
        setReady(true);
        return;
      }
      try {
        const { user } = await api.me();
        setMe(normUser(user));
        await loadAll();
      } catch {
        /* loadAll already handled 401 / offline */
      } finally {
        setReady(true);
      }
    })();
  }, [loadAll]);

  /* ---------------------------------------------------- live updates */

  /**
   * Keeps notifications (and anything a teammate changed) current without
   * a websocket: poll while the tab is visible, and catch up immediately
   * whenever it regains focus.
   */
  useEffect(() => {
    if (!ready || !me) return;

    let stopped = false;

    const tick = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      try {
        const r = await api.notifications();
        if (stopped) return;
        const next = r.notifications.map(normNotification);
        setData((d) => {
          const changed =
            next.length !== d.notifications.length ||
            next.some((n, i) => n.id !== d.notifications[i]?.id || n.read !== d.notifications[i]?.read);
          return changed ? { ...d, notifications: next } : d;
        });
      } catch {
        /* transient — the next tick retries */
      }
    };

    const interval = setInterval(tick, 15000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [ready, me]);

  /* ---------------------------------------------------- theme */

  const prefs = useMemo(
    () => ({ currency: me?.currency || 'INR', theme: me?.theme || 'system' }),
    [me],
  );

  useEffect(() => {
    if (!ready) return;
    syncThemeChrome(prefs.theme);
    try {
      localStorage.setItem(THEME_KEY, prefs.theme);
    } catch {
      /* ignore */
    }
    if (prefs.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => syncThemeChrome('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pathname, ready, prefs.theme]);

  /* ---------------------------------------------------- derived */

  const personById = useCallback(
    (pid) => data.people.find((p) => p.id === pid) || { id: pid, name: 'Someone', email: '' },
    [data.people],
  );

  const ledger = useMemo(
    () => buildLedger(data.expenses, data.settlements),
    [data.expenses, data.settlements],
  );

  const overview = useMemo(
    () => (me ? balancesFor(ledger, me.id) : { rows: [], owed: 0, owe: 0, net: 0 }),
    [ledger, me],
  );

  const unreadCount = useMemo(
    () => data.notifications.filter((n) => !n.read).length,
    [data.notifications],
  );

  /* ---------------------------------------------------- item debounce */

  // Typing a price should feel instant, so items update locally and the
  // PATCH is coalesced per item.
  const pending = useRef({});

  const updateItem = useCallback(
    (listId, itemId, patch) => {
      // optimistic
      setData((d) => ({
        ...d,
        lists: d.lists.map((l) =>
          l.id === listId
            ? { ...l, items: l.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) }
            : l,
        ),
      }));

      const key = `${listId}:${itemId}`;
      const entry = (pending.current[key] = pending.current[key] || { patch: {}, timer: null });
      entry.patch = { ...entry.patch, ...patch };
      clearTimeout(entry.timer);
      entry.timer = setTimeout(() => {
        const body = entry.patch;
        delete pending.current[key];
        api.updateItem(listId, itemId, body).catch(() => refresh(['lists']));
      }, 500);
    },
    [refresh],
  );

  useEffect(() => () => {
    Object.values(pending.current).forEach((e) => clearTimeout(e.timer));
  }, []);

  /* ---------------------------------------------------- actions */

  const actions = useMemo(
    () => ({
      /* ---- auth ---- */
      signup: async ({ name, email, password }) => {
        const { token, user } = await api.register({ name, email, password });
        setToken(token);
        setMe(normUser(user));
        await loadAll();
        return { ok: true };
      },

      login: async ({ email, password }) => {
        const { token, user } = await api.login({ email, password });
        setToken(token);
        setMe(normUser(user));
        await loadAll();
        return { ok: true };
      },

      /** Spins up a private throwaway account — no shared credentials. */
      demoLogin: async () => {
        const tag = Math.random().toString(36).slice(2, 8);
        const { token, user } = await api.register({
          name: 'Demo User',
          email: `demo.${tag}@splitta.local`,
          password: `demo-${tag}-${Date.now()}`,
        });
        setToken(token);
        setMe(normUser(user));
        await loadAll();
        return { ok: true };
      },

      logout: () => {
        setToken(null);
        setMe(null);
        setData(EMPTY);
      },

      updateProfile: async (patch) => {
        const { user } = await api.updateProfile(patch);
        setMe(normUser(user));
      },

      setPrefs: async (patch) => {
        setMe((m) => ({ ...m, ...patch })); // optimistic, theme applies instantly
        await api.updateProfile(patch).catch(() => {});
      },
      setTheme: async (theme) => {
        setMe((m) => ({ ...m, theme }));
        await api.updateProfile({ theme }).catch(() => {});
      },

      refresh,
      reload: loadAll,

      /* ---- people ---- */
      addPerson: async ({ name, email, phone }) => {
        const { person } = await api.addFriend({ name, email, phone });
        await refresh(['people']);
        return normUser(person);
      },

      removeFriend: async (pid) => {
        await api.removeFriend(pid);
        await refresh(['people']);
      },

      /* ---- groups ---- */
      createGroup: async ({ name, emoji, type, memberIds }) => {
        const { group } = await api.createGroup({ name, emoji, type, memberIds });
        await refresh(['groups', 'notifications', 'activity']);
        return normGroup(group);
      },
      updateGroup: async (gid, patch) => {
        await api.updateGroup(gid, patch);
        await refresh(['groups']);
      },
      deleteGroup: async (gid) => {
        await api.deleteGroup(gid);
        await refresh(['groups', 'expenses', 'lists']);
      },

      /* ---- expenses ---- */
      addExpense: async (payload) => {
        const { expense } = await api.createExpense({
          ...payload,
          paidBy: payload.paidBy.map((p) => ({ user: p.userId, amount: p.amount })),
          splits: payload.splits.map((s) => ({ user: s.userId, amount: s.amount })),
          items: payload.items || [],
        });
        await refresh(['expenses', 'notifications', 'activity']);
        return normExpense(expense);
      },
      updateExpense: async (eid, patch) => {
        await api.updateExpense(eid, {
          ...patch,
          ...(patch.paidBy
            ? { paidBy: patch.paidBy.map((p) => ({ user: p.userId, amount: p.amount })) }
            : {}),
          ...(patch.splits
            ? { splits: patch.splits.map((s) => ({ user: s.userId, amount: s.amount })) }
            : {}),
          ...(patch.items ? { items: patch.items } : {}),
        });
        await refresh(['expenses', 'notifications']);
      },
      deleteExpense: async (eid) => {
        await api.deleteExpense(eid);
        await refresh(['expenses', 'activity']);
      },

      /* ---- settlements ---- */
      settleUp: async ({ fromUserId, toUserId, amount, groupId, note }) => {
        const { settlement } = await api.createSettlement({
          fromUserId,
          toUserId,
          amount: round2(amount),
          groupId: groupId || null,
          note,
        });
        await refresh(['settlements', 'notifications', 'activity']);
        return normSettlement(settlement);
      },

      /** Reversing a payment changes balances, so callers must confirm first. */
      deleteSettlement: async (sid) => {
        await api.deleteSettlement(sid);
        await refresh(['settlements', 'activity']);
      },

      /* ---- lists ---- */
      createList: async ({ name, emoji, groupId, memberIds, store, budget }) => {
        const { list } = await api.createList({ name, emoji, groupId, memberIds, store, budget });
        await refresh(['lists', 'activity']);
        return normList(list);
      },
      updateList: async (lid, patch) => {
        setData((d) => ({
          ...d,
          lists: d.lists.map((l) => (l.id === lid ? { ...l, ...patch } : l)),
        }));
        await api.updateList(lid, patch).catch(() => refresh(['lists']));
      },
      deleteList: async (lid) => {
        await api.deleteList(lid);
        await refresh(['lists']);
      },

      addItem: async (lid, item) => {
        const { list } = await api.addItem(lid, item);
        const next = normList(list);
        setData((d) => ({ ...d, lists: d.lists.map((l) => (l.id === lid ? next : l)) }));
        return next.items[next.items.length - 1];
      },
      updateItem,
      deleteItem: async (lid, iid) => {
        setData((d) => ({
          ...d,
          lists: d.lists.map((l) =>
            l.id === lid ? { ...l, items: l.items.filter((i) => i.id !== iid) } : l,
          ),
        }));
        await api.deleteItem(lid, iid).catch(() => refresh(['lists']));
      },

      startShopping: async (lid) => {
        setData((d) => ({
          ...d,
          lists: d.lists.map((l) => (l.id === lid ? { ...l, status: 'shopping' } : l)),
        }));
        await api.updateList(lid, { status: 'shopping' }).catch(() => refresh(['lists']));
        refresh(['notifications']);
      },

      checkoutList: async (lid, opts = {}) => {
        const { expense } = await api.checkout(lid, opts);
        await refresh(['lists', 'expenses', 'notifications', 'activity']);
        return normExpense(expense);
      },

      reopenList: async (lid) => {
        await api.updateList(lid, { status: 'shopping' });
        await refresh(['lists']);
      },

      /* ---- notifications ---- */
      markRead: async (nid) => {
        setData((d) => ({
          ...d,
          notifications: d.notifications.map((n) => (n.id === nid ? { ...n, read: true } : n)),
        }));
        await api.readNotification(nid).catch(() => {});
      },
      markAllRead: async () => {
        setData((d) => ({
          ...d,
          notifications: d.notifications.map((n) => ({ ...n, read: true })),
        }));
        await api.readAllNotifications().catch(() => {});
      },
      clearNotifications: async () => {
        setData((d) => ({ ...d, notifications: [] }));
        await api.clearNotifications().catch(() => {});
      },
    }),
    [loadAll, refresh, updateItem],
  );

  const value = useMemo(
    () => ({
      ready,
      syncing,
      offline,
      session: me ? { userId: me.id, email: me.email } : null,
      me,
      prefs,
      currency: prefs.currency,
      ...data,
      ledger,
      overview,
      unreadCount,
      personById,
      ...actions,
    }),
    [ready, syncing, offline, me, prefs, data, ledger, overview, unreadCount, personById, actions],
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
