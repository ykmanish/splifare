/**
 * End-to-end check against a running API.
 *   npm run smoke            (expects the server on $PORT or 5000)
 *
 * Creates two throwaway accounts — friendship needs a real second party now —
 * exercises every route group, then deletes everything it made.
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
  const tokenA = reg.json.token;
  token = tokenA;
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

  // second account — the friend requests need someone to answer them
  const palEmail = `smoke.pal.${stamp}@splitta.test`;
  const regB = await call('POST', '/auth/register', {
    name: `Pal ${stamp}`,
    email: palEmail,
    password: 'supersecret123',
  });
  check('register second account', regB.status === 201, JSON.stringify(regB.json));
  const tokenB = regB.json.token;
  const palId = regB.json.user?.id;

  // isolation before friendship --------------------------------------
  const alone = await call('GET', '/friends');
  check('nobody visible before friending', alone.json.people?.length === 1, `n=${alone.json.people?.length}`);
  const myCode = alone.json.code;
  check('own share code issued', typeof myCode === 'string' && myCode.length >= 6, `code=${myCode}`);

  const early = await call('POST', '/expenses', {
    description: 'Too soon',
    amount: 50,
    paidBy: [{ user: meId, amount: 50 }],
    splits: [
      { user: meId, amount: 25 },
      { user: palId, amount: 25 },
    ],
  });
  check('cannot split with a stranger', early.status === 403, JSON.stringify(early.json));

  // friend requests --------------------------------------------------
  const unknown = await call('POST', '/friends/requests', { query: 'nobody@nowhere.test' });
  check('request to unknown address rejected', unknown.status === 404);

  const self = await call('POST', '/friends/requests', { query: email });
  check('request to yourself rejected', self.status === 400);

  const sent = await call('POST', '/friends/requests', { query: palEmail });
  check('send friend request', sent.status === 201 && !!sent.json.request?.id, JSON.stringify(sent.json));

  const again = await call('POST', '/friends/requests', { query: palEmail });
  check('duplicate request rejected', again.status === 409);

  const outbox = await call('GET', '/friends/requests');
  check('request shows as outgoing', outbox.json.outgoing?.length === 1 && outbox.json.incoming?.length === 0);

  token = tokenB;
  const inbox = await call('GET', '/friends/requests');
  check('request shows as incoming for them', inbox.json.incoming?.length === 1);
  const requestId = inbox.json.incoming?.[0]?.id;
  check(
    'incoming request hides the sender email',
    inbox.json.incoming?.[0]?.person?.email === '',
    `email=${inbox.json.incoming?.[0]?.person?.email}`,
  );

  token = tokenA;
  const notMine = await call('POST', `/friends/requests/${requestId}/accept`);
  check('sender cannot accept their own request', notMine.status === 403);

  token = tokenB;
  const accepted = await call('POST', `/friends/requests/${requestId}/accept`);
  check('accept friend request', accepted.status === 200, JSON.stringify(accepted.json));

  const reAccept = await call('POST', `/friends/requests/${requestId}/accept`);
  check('re-accepting rejected', reAccept.status === 409);

  token = tokenA;
  const people = await call('GET', '/friends');
  check('list people includes me + friend', people.json.people?.length === 2);
  check(
    'friend is flagged as a friend',
    people.json.people?.some((p) => p.id === palId && p.isFriend === true),
  );

  // groups + room codes ----------------------------------------------
  const group = await call('POST', '/groups', {
    name: 'Smoke Flat',
    emoji: '🏠',
    type: 'home',
    memberIds: [palId],
  });
  check('create group', group.status === 201 && group.json.group.members.length === 2);
  const groupId = group.json.group?.id;
  const roomCode = group.json.group?.code;
  check('group gets a room code', typeof roomCode === 'string' && roomCode.length >= 6, `code=${roomCode}`);

  const peek = await call('GET', `/groups/code/${roomCode}`);
  check('preview by code', peek.status === 200 && peek.json.group?.name === 'Smoke Flat');
  check('preview hides the member list', peek.json.group?.members === undefined);
  check('preview reports membership', peek.json.group?.isMember === true);

  const badPeek = await call('GET', '/groups/code/ZZZZZZ');
  check('unknown code rejected', badPeek.status === 404);

  // a third account joins purely through the code
  const guestEmail = `smoke.guest.${stamp}@splitta.test`;
  const regC = await call('POST', '/auth/register', {
    name: `Guest ${stamp}`,
    email: guestEmail,
    password: 'supersecret123',
  });
  const tokenC = regC.json.token;
  const guestId = regC.json.user?.id;

  token = tokenC;
  const joined = await call('POST', '/groups/join', { code: roomCode });
  check('join with a room code', joined.status === 201 && joined.json.group?.members?.length === 3, JSON.stringify(joined.json));

  const rejoin = await call('POST', '/groups/join', { code: roomCode });
  check('rejoining is a no-op', rejoin.status === 200 && rejoin.json.alreadyIn === true);

  const guestPeople = await call('GET', '/friends');
  const seenHost = guestPeople.json.people?.find((p) => p.id === meId);
  check('co-member is visible after joining', !!seenHost);
  check('co-member is not a friend', seenHost?.isFriend === false, `isFriend=${seenHost?.isFriend}`);
  check('co-member email is withheld', seenHost?.email === '', `email=${seenHost?.email}`);

  token = tokenA;
  const sneak = await call('PATCH', `/groups/${groupId}`, {
    memberIds: [meId, palId, guestId, '507f1f77bcf86cd799439011'],
  });
  check('cannot add a non-friend by id', sneak.status === 403, JSON.stringify(sneak.json));

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

  // Sharing the room is the permission — the guest is nobody's friend.
  const guestExpense = await call('POST', '/expenses', {
    groupId,
    description: 'Room-mate round',
    amount: 60,
    paidBy: [{ user: meId, amount: 60 }],
    splits: [
      { user: meId, amount: 30 },
      { user: guestId, amount: 30 },
    ],
  });
  check('can split with a co-member', guestExpense.status === 201, JSON.stringify(guestExpense.json));
  const guestExpenseId = guestExpense.json.expense?.id;

  const expenses = await call('GET', `/expenses?group=${groupId}`);
  check('list group expenses', expenses.json.expenses?.length === 2, `n=${expenses.json.expenses?.length}`);

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

  // rotate + leave ---------------------------------------------------
  const rotated = await call('POST', `/groups/${groupId}/code`);
  check('rotate room code', rotated.status === 200 && rotated.json.group?.code !== roomCode);

  const staleJoin = await call('GET', `/groups/code/${roomCode}`);
  check('old code stops working', staleJoin.status === 404);

  token = tokenC;
  const left = await call('POST', `/groups/${groupId}/leave`);
  check('leave group', left.status === 200, JSON.stringify(left.json));

  const gone = await call('GET', `/groups/${groupId}`);
  check('group hidden after leaving', gone.status === 403);

  // The balance survives the exit, so it stays settleable either way.
  const lateSettle = await call('POST', '/settlements', {
    fromUserId: guestId,
    toUserId: meId,
    amount: 30,
    note: 'after leaving',
  });
  check('shared history keeps settling possible', lateSettle.status === 201, JSON.stringify(lateSettle.json));
  const lateSettleId = lateSettle.json.settlement?.id;

  // unfriend ---------------------------------------------------------
  token = tokenA;
  const unfriend = await call('DELETE', `/friends/${palId}`);
  check('remove friend', unfriend.status === 200);

  token = tokenB;
  const mutual = await call('GET', '/friends');
  check(
    'removal is mutual',
    !mutual.json.people?.some((p) => p.id === meId && p.isFriend),
    JSON.stringify(mutual.json.people?.map((p) => [p.id, p.isFriend])),
  );

  token = tokenA;
  const reRequest = await call('POST', '/friends/requests', { query: palEmail });
  check('can request again after removal', reRequest.status === 201, JSON.stringify(reRequest.json));
  const reRequestId = reRequest.json.request?.id;
  const withdrawn = await call('DELETE', `/friends/requests/${reRequestId}`);
  check('withdraw a sent request', withdrawn.status === 200);

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
  await call('DELETE', `/expenses/${guestExpenseId}`);
  if (lateSettleId) await call('DELETE', `/settlements/${lateSettleId}`);
  await call('DELETE', `/lists/${listId}`);
  await call('DELETE', `/groups/${groupId}`);
  console.log('\n  cleaned up test data');

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('\nSmoke test crashed:', e.message, '\n');
  process.exit(1);
});
