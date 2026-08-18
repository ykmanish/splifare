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
  normFriendRequest,
} from '@/lib/api';
import { buildLedger, balancesFor } from '@/lib/balances';
import { makeConverter, noConvert } from '@/lib/fx';
import {
  registerServiceWorker,
  currentSubscription,
  enablePush,
  disablePush,
  permissionState,
  pushSupported,
} from '@/lib/push';
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
  incoming: [],
  outgoing: [],
  myCode: '',
};

export function AppProvider({ children }) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState(null);
  const [data, setData] = useState(EMPTY);
  const [syncing, setSyncing] = useState(false);
  const [offline, setOffline] = useState(false);

  /** Live FX table, keyed on the viewer's own currency. */
  const [fx, setFx] = useState({ base: null, date: null, rates: null, source: '', stale: false });

  /** 'granted' | 'denied' | 'default' | 'unsupported', plus whether this
      browser currently holds a subscription. */
  const [push, setPush] = useState({ permission: 'default', subscribed: false, ready: false });

  const patchData = useCallback((patch) => setData((d) => ({ ...d, ...patch })), []);

  /* ---------------------------------------------------- loading */

  const loadAll = useCallback(async () => {
    setSyncing(true);
    try {
      const [people, groups, expenses, settlements, lists, notifications, activity, requests] =
        await Promise.all([
          api.people(),
          api.groups(),
          api.expenses(),
          api.settlements(),
          api.lists(),
          api.notifications(),
          api.activity(),
          api.friendRequests(),
        ]);

      setData({
        people: people.people.map(normUser),
        myCode: people.code || '',
        groups: groups.groups.map(normGroup),
        expenses: expenses.expenses.map(normExpense),
        settlements: settlements.settlements.map(normSettlement),
        lists: lists.lists.map(normList),
        notifications: notifications.notifications.map(normNotification),
        activity: activity.activity.map(normActivity),
        incoming: requests.incoming.map(normFriendRequest),
        outgoing: requests.outgoing.map(normFriendRequest),
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

  /**
   * Pull the rate table for a display currency. Failure is survivable — the
   * converter falls back to identity, which is exactly right for the common
   * case of an account whose expenses are all in one currency.
   */
  const loadRates = useCallback(async (base) => {
    if (!base) return;
    try {
      const table = await api.rates(base);
      setFx({
        base: table.base,
        date: table.date,
        rates: table.rates,
        source: table.source,
        stale: !!table.stale,
      });
    } catch {
      setFx((f) => (f.base === base ? f : { base: null, date: null, rates: null, source: '', stale: true }));
    }
  }, []);

  /** Refresh only the slices an action touched. */
  const refresh = useCallback(
    async (keys = ['expenses', 'settlements', 'notifications', 'activity']) => {
      const jobs = {
        people: () =>
          api.people().then((r) => ({ people: r.people.map(normUser), myCode: r.code || '' })),
        requests: () =>
          api.friendRequests().then((r) => ({
            incoming: r.incoming.map(normFriendRequest),
            outgoing: r.outgoing.map(normFriendRequest),
          })),
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
        const mine = normUser(user);
        setMe(mine);
        // Rates run alongside the main load rather than gating it.
        loadRates(mine.currency);
        await loadAll();
      } catch {
        /* loadAll already handled 401 / offline */
      } finally {
        setReady(true);
      }
    })();
  }, [loadAll, loadRates]);

  /* ---------------------------------------------------- push */

  /**
   * Register the worker and read back whether this browser is already
   * subscribed. Registration is safe to do unconditionally — it does not
   * prompt; only enablePush() does, and that needs a user gesture.
   */
  useEffect(() => {
    if (!ready || !me) return;
    let stopped = false;

    (async () => {
      if (!pushSupported()) {
        if (!stopped) setPush({ permission: 'unsupported', subscribed: false, ready: true });
        return;
      }
      await registerServiceWorker();
      const sub = await currentSubscription();
      if (!stopped) {
        setPush({ permission: permissionState(), subscribed: !!sub, ready: true });
      }
    })();

    return () => {
      stopped = true;
    };
  }, [ready, me]);

  /* A push service can rotate a subscription; the worker tells us to redo it. */
  useEffect(() => {
    if (!ready || !me || !pushSupported()) return;

    const onMessage = (event) => {
      if (event.data?.type !== 'push-resubscribe') return;
      enablePush()
        .then((r) => setPush((prev) => ({ ...prev, subscribed: !!r.ok })))
        .catch(() => {});
    };

    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [ready, me]);

  /* ---------------------------------------------------- live updates */

  /**
   * Keeps notifications (and anything a teammate changed) current without
   * a websocket: poll while the tab is visible, and catch up immediately
   * whenever it regains focus.
   */
  const pushLive = push.subscribed && push.permission === 'granted';

  useEffect(() => {
    if (!ready || !me) return;

    let stopped = false;

    const tick = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      try {
        // Friend requests ride along with the poll so an invite lands on the
        // friends screen without the recipient reloading anything.
        const [r, reqs] = await Promise.all([api.notifications(), api.friendRequests()]);
        if (stopped) return;
        const next = r.notifications.map(normNotification);
        const incoming = reqs.incoming.map(normFriendRequest);
        const outgoing = reqs.outgoing.map(normFriendRequest);
        setData((d) => {
          const sameIds = (a, b) =>
            a.length === b.length && a.every((x, i) => x.id === b[i]?.id);
          const changed =
            next.length !== d.notifications.length ||
            next.some((n, i) => n.id !== d.notifications[i]?.id || n.read !== d.notifications[i]?.read) ||
            !sameIds(incoming, d.incoming) ||
            !sameIds(outgoing, d.outgoing);
          return changed ? { ...d, notifications: next, incoming, outgoing } : d;
        });
      } catch {
        /* transient — the next tick retries */
      }
    };

    // With push delivering, the poll is only a safety net for missed
    // messages, so it drops to a fifth of the rate.
    const interval = setInterval(tick, pushLive ? 75000 : 15000);
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
  }, [ready, me, pushLive]);

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

  /**
   * Only confirmed friends. `people` is wider — it also holds the people you
   * merely share a group with, so names still resolve on a group screen — but
   * pickers must offer friends only.
   */
  const friends = useMemo(
    () => data.people.filter((p) => p.isFriend && p.id !== me?.id),
    [data.people, me],
  );

  /** Friends plus yourself, in the order a picker wants them. */
  const splitPool = useMemo(
    () => (me ? [me, ...friends] : friends),
    [me, friends],
  );

  /**
   * Every amount is netted in the viewer's currency. Until the rate table
   * lands this is identity, so totals for a single-currency account are
   * correct from the first frame instead of flickering.
   */
  const convert = useMemo(
    () => (fx.rates && fx.base ? makeConverter(fx.base, fx.rates) : noConvert),
    [fx.base, fx.rates],
  );

  const ledger = useMemo(
    () => buildLedger(data.expenses, data.settlements, undefined, convert),
    [data.expenses, data.settlements, convert],
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
        const next = normUser(user);
        setMe(next);
        // A new display currency needs its own rate table.
        if (patch.currency) loadRates(next.currency);
      },

      setPrefs: async (patch) => {
        setMe((m) => ({ ...m, ...patch })); // optimistic, theme applies instantly
        await api.updateProfile(patch).catch(() => {});
        if (patch.currency) loadRates(patch.currency);
      },
      setTheme: async (theme) => {
        setMe((m) => ({ ...m, theme }));
        await api.updateProfile({ theme }).catch(() => {});
      },

      refresh,
      reload: loadAll,

      /* ---- friend requests ---- */

      /** `query` is an exact email address or a Splitta code. */
      sendFriendRequest: async (query) => {
        const res = await api.sendFriendRequest(String(query || '').trim());
        // The server auto-accepts when the other person had already asked,
        // so the friend list can change here too.
        await refresh(res.accepted ? ['people', 'requests'] : ['requests']);
        return {
          accepted: !!res.accepted,
          message: res.message || '',
          person: res.person ? normUser(res.person) : normFriendRequest(res.request)?.person,
        };
      },

      acceptFriendRequest: async (rid) => {
        const { person } = await api.acceptFriendRequest(rid);
        await refresh(['people', 'requests', 'activity', 'notifications']);
        return person ? normUser(person) : null;
      },

      declineFriendRequest: async (rid) => {
        await api.declineFriendRequest(rid);
        await refresh(['requests']);
      },

      cancelFriendRequest: async (rid) => {
        await api.cancelFriendRequest(rid);
        await refresh(['requests']);
      },

      removeFriend: async (pid) => {
        await api.removeFriend(pid);
        await refresh(['people', 'requests']);
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

      /* ---- room codes ---- */

      /** Look up a code without joining, so the sheet can confirm the group. */
      previewGroup: async (code) => {
        const { group } = await api.groupByCode(String(code || '').trim());
        return group;
      },

      joinGroup: async (code) => {
        const { group, alreadyIn } = await api.joinGroup(String(code || '').trim());
        // `people` too: co-members become visible the moment you are in.
        await refresh(['groups', 'people', 'expenses', 'notifications', 'activity']);
        return { group: normGroup(group), alreadyIn: !!alreadyIn };
      },

      leaveGroup: async (gid) => {
        await api.leaveGroup(gid);
        await refresh(['groups', 'people', 'lists', 'activity']);
      },

      rotateGroupCode: async (gid) => {
        const { group } = await api.rotateGroupCode(gid);
        await refresh(['groups']);
        return normGroup(group);
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
      settleUp: async ({ fromUserId, toUserId, amount, currency: cur, groupId, note }) => {
        const { settlement } = await api.createSettlement({
          fromUserId,
          toUserId,
          amount: round2(amount),
          currency: cur,
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

      /* ---- push ---- */
      enablePush: async () => {
        const result = await enablePush();
        setPush({
          permission: permissionState(),
          subscribed: !!result.ok,
          ready: true,
        });
        return result;
      },

      disablePush: async () => {
        await disablePush();
        setPush({ permission: permissionState(), subscribed: false, ready: true });
      },

      testPush: () => api.pushTest(),

      /* ---- currency ---- */
      refreshRates: (base) => loadRates(base),

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
    [loadAll, refresh, updateItem, loadRates],
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
      friends,
      splitPool,
      requestCount: data.incoming.length,
      fx,
      convert,
      push,
      ledger,
      overview,
      unreadCount,
      personById,
      ...actions,
    }),
    [
      ready,
      syncing,
      offline,
      me,
      prefs,
      data,
      friends,
      splitPool,
      fx,
      convert,
      push,
      ledger,
      overview,
      unreadCount,
      personById,
      actions,
    ],
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
