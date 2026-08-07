/**
 * End-to-end check against a running API.
 *   npm run smoke            (expects the server on $PORT or 5000)
 *
 * Creates a throwaway account, exercises every route group, then
 * deletes everything it made.
 */
require('dotenv').config({ quiet: true });

const BASE = `http://localhost:${process.env.PORT || 5000}/api`;
const stamp = Date.now();

let token = null;
let pass = 0;
let fail = 0;

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

function check(label, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}  ${detail}`);
  }
  return ok;
}

(async () => {
  console.log(`\nSmoke test → ${BASE}\n`);

  // health -----------------------------------------------------------
  const health = await call('GET', '/health');
  check('health', health.status === 200 && health.json.ok, JSON.stringify(health.json));
  check('db connected', health.json.db === 'connected', `db=${health.json.db}`);

  // auth -------------------------------------------------------------
  const email = `smoke.${stamp}@splitta.test`;
  const reg = await call('POST', '/auth/register', {
    name: 'Smoke Tester',
    email,
    password: 'supersecret123',
  });
  check('register', reg.status === 201 && !!reg.json.token, JSON.stringify(reg.json));
  token = reg.json.token;
  const meId = reg.json.user?.id;

  const dupe = await call('POST', '/auth/register', {
    name: 'Smoke Tester',
    email,
    password: 'supersecret123',
  });
  check('duplicate email rejected', dupe.status === 409);

  const badLogin = await call('POST', '/auth/login', { email, password: 'wrong' });
  check('bad password rejected', badLogin.status === 401);

  const login = await call('POST', '/auth/login', { email, password: 'supersecret123' });
  check('login', login.status === 200 && !!login.json.token);

  const me = await call('GET', '/auth/me');
  check('GET /auth/me', me.status === 200 && me.json.user.email === email);

  // friends ----------------------------------------------------------
  const friend = await call('POST', '/friends', { name: `Pal ${stamp}` });
  check('add friend', friend.status === 201 && !!friend.json.person?.id);
  const palId = friend.json.person?.id;

  const people = await call('GET', '/friends');
  check('list people includes me + friend', people.json.people?.length === 2);

  // groups -----------------------------------------------------------
  const group = await call('POST', '/groups', {
    name: 'Smoke Flat',
    emoji: '🏠',
    type: 'home',
    memberIds: [palId],
  });
  check('create group', group.status === 201 && group.json.group.members.length === 2);
  const groupId = group.json.group?.id;

  // expenses ---------------------------------------------------------
  const badSplit = await call('POST', '/expenses', {
    description: 'Broken',
    amount: 100,
    paidBy: [{ user: meId, amount: 100 }],
    splits: [{ user: meId, amount: 40 }, { user: palId, amount: 40 }],
  });
  check('unbalanced split rejected', badSplit.status === 422, JSON.stringify(badSplit.json));

  const expense = await call('POST', '/expenses', {
    groupId,
    description: 'Smoke dinner',
    amount: 100,
    category: 'food',
    paidBy: [{ user: meId, amount: 100 }],
    splits: [
      { user: meId, amount: 50 },
      { user: palId, amount: 50 },
    ],
  });
  check('create expense', expense.status === 201, JSON.stringify(expense.json));
  const expenseId = expense.json.expense?.id;

  const expenses = await call('GET', `/expenses?group=${groupId}`);
  check('list group expenses', expenses.json.expenses?.length === 1);

  const patched = await call('PATCH', `/expenses/${expenseId}`, { description: 'Smoke dinner v2' });
  check('edit expense', patched.json.expense?.description === 'Smoke dinner v2');

  // settlements ------------------------------------------------------
  const settle = await call('POST', '/settlements', {
    fromUserId: palId,
    toUserId: meId,
    amount: 50,
    groupId,
    note: 'smoke',
  });
  check('record settlement', settle.status === 201, JSON.stringify(settle.json));

  // lists ------------------------------------------------------------
  const list = await call('POST', '/lists', {
    name: 'Smoke run',
    emoji: '🛒',
    groupId,
    memberIds: [palId],
    store: 'Test Mart',
    budget: 500,
  });
  check('create list', list.status === 201);
  const listId = list.json.list?.id;

  const it1 = await call('POST', `/lists/${listId}/items`, {
    name: 'Rice',
    qty: 2,
    unit: 'kg',
    aisle: 'pantry',
  });
  check('add shared item', it1.status === 201 && it1.json.list.items.length === 1);

  const it2 = await call('POST', `/lists/${listId}/items`, {
    name: 'Protein powder',
    aisle: 'household',
    splitWith: [palId],
  });
  check('add solo item', it2.json.list.items.length === 2);

  const items = it2.json.list.items;
  await call('PATCH', `/lists/${listId}/items/${items[0].id}`, { checked: true, price: 300 });
  const priced = await call('PATCH', `/lists/${listId}/items/${items[1].id}`, {
    checked: true,
    price: 200,
  });
  check('price items', priced.status === 200);

  const checkout = await call('POST', `/lists/${listId}/checkout`, { payer: meId });
  const co = checkout.json.expense;
  check('checkout creates expense', checkout.status === 201, JSON.stringify(checkout.json));
  check('checkout total is 500', co?.amount === 500, `got ${co?.amount}`);

  // Rice 300 split 2 ways = 150 each; powder 200 goes wholly to the pal.
  const mine = co?.splits.find((s) => String(s.user) === String(meId))?.amount;
  const theirs = co?.splits.find((s) => String(s.user) === String(palId))?.amount;
  check('per-item split is 150 / 350', mine === 150 && theirs === 350, `me=${mine} pal=${theirs}`);
  check('list marked completed', checkout.json.list?.status === 'completed');

  const reCheckout = await call('POST', `/lists/${listId}/checkout`, { payer: meId });
  check('double checkout rejected', reCheckout.status === 400);

  // feed -------------------------------------------------------------
  const activity = await call('GET', '/activity');
  check('activity feed populated', (activity.json.activity?.length || 0) >= 3, `n=${activity.json.activity?.length}`);

  const notes = await call('GET', '/notifications');
  check('notifications endpoint', notes.status === 200);

  // auth guard -------------------------------------------------------
  const saved = token;
  token = null;
  const guarded = await call('GET', '/groups');
  check('unauthenticated request blocked', guarded.status === 401);
  token = saved;

  // cleanup ----------------------------------------------------------
  await call('DELETE', `/lists/${listId}`);
  await call('DELETE', `/groups/${groupId}`);
  console.log('\n  cleaned up test data');

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('\nSmoke test crashed:', e.message, '\n');
  process.exit(1);
});
