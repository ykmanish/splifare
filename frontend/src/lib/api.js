/**
 * Thin API client. Also normalises server shapes (`_id` refs, `members`,
 * `paidBy[].user`) into the flatter shapes the components already speak
 * (`id`, `memberIds`, `paidBy[].userId`), so screens need no changes.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
const TOKEN_KEY = 'splitta.token';

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setToken = (t) => {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode */
  }
};

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }

  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server — is the API running?');
  }

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  if (!res.ok) {
    throw new ApiError(res.status, data.error || `Request failed (${res.status})`, data.details);
  }
  return data;
}

const get = (p) => request(p);
const post = (p, body, opts) => request(p, { method: 'POST', body, ...opts });
const patch = (p, body) => request(p, { method: 'PATCH', body });
const del = (p) => request(p, { method: 'DELETE' });

/* ================================================================
   NORMALISERS  — server shape → client shape
   ================================================================ */

const id = (v) => (v && typeof v === 'object' ? String(v.id || v._id) : v ? String(v) : null);
const ids = (arr) => (arr || []).map(id).filter(Boolean);

export const normUser = (u) =>
  u && {
    id: id(u),
    name: u.name,
    email: u.email || '',
    phone: u.phone || '',
    currency: u.currency || 'INR',
    theme: u.theme || 'system',
    avatarSeed: u.avatarSeed || '',
    avatarStyle: u.avatarStyle || 'adventurer',
    avatarBg: u.avatarBg || '',
    /** Shareable handle — only ever sent for your own account. */
    code: u.code || '',
    /**
     * Confirmed friend, versus someone visible only because you share a
     * group. Non-friends stay out of every picker. `/auth/me` does not send
     * the flag, so it defaults to true and never hides you from yourself.
     */
    isFriend: u.isFriend !== false,
  };

export const normGroup = (g) =>
  g && {
    id: id(g),
    name: g.name,
    emoji: g.emoji,
    type: g.type,
    memberIds: ids(g.members),
    code: g.code || '',
    createdBy: id(g.createdBy),
    createdAt: g.createdAt,
  };

const normShares = (rows) =>
  (rows || []).map((r) => ({ userId: id(r.user), amount: Number(r.amount) || 0 }));

export const normExpense = (e) =>
  e && {
    id: id(e),
    groupId: id(e.group),
    description: e.description,
    amount: Number(e.amount) || 0,
    currency: e.currency,
    category: e.category,
    paidBy: normShares(e.paidBy),
    splits: normShares(e.splits),
    splitMode: e.splitMode,
    date: e.date,
    notes: e.notes || '',
    items: (e.items || []).map((i) => ({
      id: id(i),
      name: i.name,
      price: Number(i.price) || 0,
    })),
    createdBy: id(e.createdBy),
    listId: id(e.list),
    createdAt: e.createdAt,
  };

export const normSettlement = (s) =>
  s && {
    id: id(s),
    fromUserId: id(s.from),
    toUserId: id(s.to),
    amount: Number(s.amount) || 0,
    currency: s.currency || 'INR',
    groupId: id(s.group),
    note: s.note || '',
    date: s.date,
  };

export const normList = (l) =>
  l && {
    id: id(l),
    name: l.name,
    emoji: l.emoji,
    groupId: id(l.group),
    memberIds: ids(l.members),
    status: l.status,
    store: l.store || '',
    budget: l.budget ?? null,
    createdBy: id(l.createdBy),
    createdAt: l.createdAt,
    completedAt: l.completedAt,
    expenseId: id(l.expense),
    items: (l.items || []).map((i) => ({
      id: id(i),
      name: i.name,
      qty: i.qty,
      unit: i.unit,
      aisle: i.aisle,
      note: i.note || '',
      addedBy: id(i.addedBy),
      checked: !!i.checked,
      price: i.price ?? null,
      splitWith: ids(i.splitWith),
    })),
  };

export const normFriendRequest = (r) =>
  r && {
    id: id(r),
    status: r.status,
    fromId: id(r.fromId ?? r.from),
    toId: id(r.toId ?? r.to),
    person: normUser(r.person),
    createdAt: r.createdAt,
  };

export const normNotification = (n) =>
  n && {
    id: id(n),
    type: n.type,
    title: n.title,
    body: n.body || '',
    actorId: id(n.actor),
    entityType: n.entityType,
    entityId: n.entityId,
    read: !!n.read,
    createdAt: n.createdAt,
  };

export const normActivity = (a) =>
  a && {
    id: id(a),
    type: a.type,
    text: a.text,
    amount: a.amount ?? null,
    currency: a.currency || null,
    actorId: id(a.actor),
    entityType: a.entityType,
    entityId: a.entityId,
    createdAt: a.createdAt,
  };

/* ================================================================
   ENDPOINTS
   ================================================================ */

export const api = {
  /* auth */
  register: (body) => post('/auth/register', body, { auth: false }),
  login: (body) => post('/auth/login', body, { auth: false }),
  me: () => get('/auth/me'),
  updateProfile: (body) => patch('/auth/me', body),
  changePassword: (body) => post('/auth/password', body),

  /* people */
  people: () => get('/friends'),
  removeFriend: (pid) => del(`/friends/${pid}`),

  /* friend requests */
  friendRequests: () => get('/friends/requests'),
  sendFriendRequest: (query) => post('/friends/requests', { query }),
  acceptFriendRequest: (rid) => post(`/friends/requests/${rid}/accept`),
  declineFriendRequest: (rid) => post(`/friends/requests/${rid}/decline`),
  cancelFriendRequest: (rid) => del(`/friends/requests/${rid}`),

  /* groups */
  groups: () => get('/groups'),
  createGroup: (body) => post('/groups', body),
  updateGroup: (gid, body) => patch(`/groups/${gid}`, body),
  deleteGroup: (gid) => del(`/groups/${gid}`),

  /* room codes */
  groupByCode: (code) => get(`/groups/code/${encodeURIComponent(code)}`),
  joinGroup: (code) => post('/groups/join', { code }),
  leaveGroup: (gid) => post(`/groups/${gid}/leave`),
  rotateGroupCode: (gid) => post(`/groups/${gid}/code`),

  /* expenses */
  expenses: (params = '') => get(`/expenses${params}`),
  createExpense: (body) => post('/expenses', body),
  updateExpense: (eid, body) => patch(`/expenses/${eid}`, body),
  deleteExpense: (eid) => del(`/expenses/${eid}`),

  /* settlements */
  settlements: () => get('/settlements'),
  createSettlement: (body) => post('/settlements', body),
  deleteSettlement: (sid) => del(`/settlements/${sid}`),

  /* lists */
  lists: () => get('/lists'),
  createList: (body) => post('/lists', body),
  updateList: (lid, body) => patch(`/lists/${lid}`, body),
  deleteList: (lid) => del(`/lists/${lid}`),
  addItem: (lid, body) => post(`/lists/${lid}/items`, body),
  updateItem: (lid, iid, body) => patch(`/lists/${lid}/items/${iid}`, body),
  deleteItem: (lid, iid) => del(`/lists/${lid}/items/${iid}`),
  checkout: (lid, body) => post(`/lists/${lid}/checkout`, body),

  /* feed */
  notifications: () => get('/notifications'),
  readNotification: (nid) => patch(`/notifications/${nid}/read`),
  readAllNotifications: () => post('/notifications/read-all'),
  clearNotifications: () => del('/notifications'),
  activity: () => get('/activity'),

  /* exchange rates */
  rates: (base) => get(`/rates${base ? `?base=${encodeURIComponent(base)}` : ''}`),

  /* web push */
  pushKey: () => get('/push/key'),
  pushSubscribe: (subscription) => post('/push/subscribe', subscription),
  pushUnsubscribe: (endpoint) => post('/push/unsubscribe', { endpoint }),
  pushTest: () => post('/push/test'),

  health: () => request('/health', { auth: false }),
};
