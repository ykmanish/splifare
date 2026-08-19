/*
 * Account-closure tests, against the running API.
 *
 * The five assertions the design spec called highest-value, plus the guard
 * rails around them. Every account it makes is cleaned up at the end.
 */
const API = 'http://localhost:5000/api';
const S = Date.now().toString().slice(-7);
const PW = 'supersecret123';

let pass = 0;
const fails = [];
const ok = (label, cond, extra = '') => {
  if (cond) { pass++; console.log('  PASS ' + label); }
  else { fails.push(label); console.log('  FAIL ' + label + (extra ? '  ← ' + extra : '')); }
};

async function call(method, path, body, token) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body === undefined || body === null ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, body: json };
}

const reg = async (name, tag) => {
  const email = `${tag}.${S}@closetest.dev`;
  const r = await call('POST', '/auth/register', { name, email, password: PW });
  if (!r.body?.token) throw new Error('register ' + tag + ' → ' + JSON.stringify(r));
  return { token: r.body.token, id: r.body.user.id, email, name };
};

const befriend = async (a, b) => {
  await call('POST', '/friends/requests', { query: b.email }, a.token);
  const inbox = await call('GET', '/friends/requests', null, b.token);
  const row = inbox.body.incoming.find((x) => x.person.id === a.id);
  await call('POST', `/friends/requests/${row.id}/accept`, {}, b.token);
};

(async () => {
  console.log('\n=== setup ===');
  const A = await reg('Asha Payer', 'asha');
  const B = await reg('Bilal Leaver', 'bilal');
  const C = await reg('Chen Stayer', 'chen');
  await befriend(A, B);
  await befriend(A, C);
  await befriend(B, C);

  const g = await call('POST', '/groups', { name: 'Closetest ' + S }, A.token);
  const gid = g.body.group.id;
  await call('POST', '/groups/join', { code: g.body.group.code }, B.token);
  await call('POST', '/groups/join', { code: g.body.group.code }, C.token);

  const solo = await call('POST', '/groups', { name: 'Bilal solo ' + S }, B.token);
  const soloId = solo.body.group.id;

  const exp = await call('POST', '/expenses', {
    groupId: gid,
    description: 'Dinner',
    amount: 3000,
    currency: 'INR',
    paidBy: [{ userId: A.id, amount: 3000 }],
    splits: [{ userId: A.id, amount: 1000 }, { userId: B.id, amount: 1000 }, { userId: C.id, amount: 1000 }],
  }, A.token);
  ok('setup: expense created', exp.status === 201, JSON.stringify(exp.body));
  const eid = exp.body.expense.id;

  // The Splitta code is minted lazily by GET /friends, not at register — read
  // it from there or it is still undefined.
  const bCode = (await call('GET', '/friends', null, B.token)).body.code;
  await call('PATCH', '/auth/me', { username: 'bilal' + S }, B.token);

  console.log('\n=== refusals (nothing should be destroyed) ===');
  const noConfirm = await call('DELETE', '/auth/me', { password: PW }, B.token);
  ok('blank confirm → 400', noConfirm.status === 400, `${noConfirm.status} ${JSON.stringify(noConfirm.body)}`);

  const wrongEmail = await call('DELETE', '/auth/me', { password: PW, confirm: 'nope@nope.dev' }, B.token);
  ok('wrong email → 400', wrongEmail.status === 400, `${wrongEmail.status} ${JSON.stringify(wrongEmail.body)}`);

  const wrongPw = await call('DELETE', '/auth/me', { password: 'notmypassword', confirm: B.email }, B.token);
  ok('wrong password → 401', wrongPw.status === 401, `${wrongPw.status} ${JSON.stringify(wrongPw.body)}`);

  const stillAlive = await call('GET', '/auth/me', null, B.token);
  ok('a refused attempt leaves the account working', stillAlive.status === 200, String(stillAlive.status));

  console.log('\n=== close it ===');
  const closed = await call('DELETE', '/auth/me', { password: PW, confirm: B.email.toUpperCase() }, B.token);
  ok('close → 200 (email compared case-insensitively)', closed.status === 200 && closed.body?.ok === true,
    `${closed.status} ${JSON.stringify(closed.body)}`);

  console.log('\n=== 1. the money is untouched ===');
  const cSees = await call('GET', '/expenses', null, C.token);
  const row = cSees.body.expenses.find((e) => e.id === eid);
  ok('expense still exists for a survivor', !!row);
  if (row) {
    ok('all three splits intact', row.splits.length === 3, JSON.stringify(row.splits));
    ok('split amounts unchanged',
      row.splits.every((sp) => sp.amount === 1000), JSON.stringify(row.splits.map((x) => x.amount)));
    ok('payer unchanged', String(row.paidBy[0].user || row.paidBy[0].userId) === A.id);
    ok('closed account still a participant', row.participants.map(String).includes(B.id),
      JSON.stringify(row.participants));
    ok('createdBy still points at the author', String(row.createdBy) === A.id, String(row.createdBy));
    ok('total unchanged', row.amount === 3000, String(row.amount));
  }

  console.log('\n=== 2. a survivor can still settle with the closed account ===');
  const settle = await call('POST', '/settlements',
    { groupId: gid, from: C.id, to: B.id, amount: 1000, currency: 'INR' }, C.token);
  ok('settle with a closed account → 2xx', settle.status === 200 || settle.status === 201,
    `${settle.status} ${JSON.stringify(settle.body)}`);

  const cPeople = await call('GET', '/friends', null, C.token);
  const ghost = (cPeople.body.people || cPeople.body.friends || []).find((p) => p.id === B.id);
  ok('closed account still visible to a survivor', !!ghost,
    JSON.stringify((cPeople.body.people || []).map((p) => p.name)));
  if (ghost) {
    ok('flagged deleted', ghost.deleted === true, JSON.stringify(ghost.deleted));
    ok('keeps its name so history reads right', ghost.name === 'Bilal Leaver', ghost.name);
    ok('not a friend any more', ghost.isFriend === false, String(ghost.isFriend));
    ok('contact details blank', ghost.email === '' && !ghost.upiId,
      JSON.stringify({ email: ghost.email, upi: ghost.upiId }));
  }

  console.log('\n=== 3. the session is dead ===');
  ok('old token → 401 on /auth/me', (await call('GET', '/auth/me', null, B.token)).status === 401);
  ok('old token → 401 on /expenses', (await call('GET', '/expenses', null, B.token)).status === 401);
  ok('old token → 401 on /groups', (await call('GET', '/groups', null, B.token)).status === 401);
  ok('old token → 401 on a second DELETE (idempotent from the client)',
    (await call('DELETE', '/auth/me', { password: PW, confirm: B.email }, B.token)).status === 401);

  const { io } = require('socket.io-client');
  const sock = io('http://localhost:5000', { auth: { token: B.token }, reconnection: false, timeout: 4000 });
  const socketVerdict = await new Promise((resolve) => {
    const done = (v) => { try { sock.close(); } catch { /* already closed */ } resolve(v); };
    sock.on('connect', () => done('CONNECTED'));
    sock.on('connect_error', (e) => done('refused: ' + e.message));
    setTimeout(() => done('timeout'), 5000);
  });
  ok('socket handshake refused for a closed account', socketVerdict.startsWith('refused'), socketVerdict);

  console.log('\n=== 4. reachability revoked both ways ===');
  const nameThem = await call('POST', '/expenses', {
    description: 'Taxi', amount: 500, currency: 'INR',
    paidBy: [{ userId: C.id, amount: 500 }],
    splits: [{ userId: C.id, amount: 250 }, { userId: B.id, amount: 250 }],
  }, C.token);
  ok('survivor cannot name a closed account in a NEW expense → 403', nameThem.status === 403,
    `${nameThem.status} ${JSON.stringify(nameThem.body)}`);

  const cGroups = await call('GET', '/groups', null, C.token);
  const shared = cGroups.body.groups.find((x) => x.id === gid);
  ok('pulled out of the shared group', shared && !shared.members.map(String).includes(B.id),
    JSON.stringify(shared?.members));

  const cReqs = await call('GET', '/friends/requests', null, C.token);
  const lingering = [...cReqs.body.incoming, ...cReqs.body.outgoing].some(
    (r) => r.person?.id === B.id,
  );
  ok('no friend request rows left referencing them', !lingering);

  console.log('\n=== 5. email released, code reserved ===');
  const reReg = await call('POST', '/auth/register', { name: 'Bilal Again', email: B.email, password: PW });
  ok('the email can be registered again → 201', reReg.status === 201,
    `${reReg.status} ${JSON.stringify(reReg.body)}`);
  ok('and it is a brand-new account', reReg.body?.user?.id && reReg.body.user.id !== B.id,
    `${reReg.body?.user?.id} vs ${B.id}`);
  const B2 = reReg.body?.user?.id ? { token: reReg.body.token, id: reReg.body.user.id } : null;
  if (B2) {
    const inherited = await call('GET', '/expenses', null, B2.token);
    ok('the new account inherits nothing', (inherited.body.expenses || []).length === 0,
      String((inherited.body.expenses || []).length));
  }

  ok('the test actually has a code to try', !!bCode, JSON.stringify(bCode));
  const byCode = await call('POST', '/friends/requests', { query: bCode }, C.token);
  ok('their old Splitta code no longer resolves → 404', byCode.status === 404,
    `${byCode.status} ${JSON.stringify(byCode.body)}`);

  const oldLogin = await call('POST', '/auth/login', { email: B.email, password: PW });
  ok('logging in with that email reaches the NEW account, not the closed one',
    oldLogin.status === 200 && oldLogin.body.user.id !== B.id,
    `${oldLogin.status} ${oldLogin.body?.user?.id}`);

  console.log('\n=== housekeeping ===');
  const soloGone = await call('GET', `/groups/${soloId}`, null, C.token);
  ok('their empty solo group is gone (404/403, not listable)',
    soloGone.status === 404 || soloGone.status === 403, String(soloGone.status));

  const cNotifs = await call('GET', '/notifications', null, C.token);
  const told = (cNotifs.body.notifications || []).some((n) => n.type === 'account_closed');
  ok('survivors are notified', told,
    JSON.stringify((cNotifs.body.notifications || []).map((n) => n.type)));

  const cActivity = await call('GET', '/activity', null, C.token);
  const logged = (cActivity.body.activity || []).some((a) => a.type === 'account_closed');
  ok('it lands in the activity feed', logged);

  console.log('\n=== cleanup ===');
  const tokens = [A.token, C.token, B2 && B2.token].filter(Boolean);
  const emails = [A.email, C.email, B.email];
  for (let i = 0; i < tokens.length; i++) {
    await call('DELETE', '/auth/me', { password: PW, confirm: emails[i] }, tokens[i]);
  }
  console.log('  test accounts closed (rows tombstoned, marked with @closetest.dev)');

  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) fails.forEach((f) => console.log('   ✗ ' + f));
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('THREW', e); process.exit(1); });
