/**
 * End-to-end check of the engagement features.
 *
 * Registers two throwaway accounts, puts them in a group, and drives every
 * new route the way the app does — including the one thing unit tests cannot
 * cover: that a recurring bill dated in the past actually materialises into a
 * real expense on somebody's balance, exactly once, even when both members
 * open the group at the same moment.
 *
 * Everything it creates is deleted at the end. Run against a dev database:
 *   node scripts/smoke-engage.js
 */

require('dotenv').config({ quiet: true });

const BASE = process.env.SMOKE_API || 'http://localhost:5055/api';

let pass = 0;
let fail = 0;

function check(label, ok, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

const stamp = Date.now();
const account = (tag) => ({
  name: `Smoke ${tag}`,
  email: `smoke.${tag}.${stamp}@example.test`,
  password: 'smoke-test-pw-1',
});

async function main() {
  console.log(`\nEngagement smoke test → ${BASE}\n`);

  /* ---------------------------------------------------------- accounts */
  const alice = account('alice');
  const bob = account('bob');

  const reg1 = await call('/auth/register', { method: 'POST', body: alice });
  const reg2 = await call('/auth/register', { method: 'POST', body: bob });
  check('registered two accounts', reg1.status === 201 && reg2.status === 201,
    `${reg1.status}/${reg2.status} ${JSON.stringify(reg1.data).slice(0, 120)}`);
  if (reg1.status !== 201) return;

  const A = reg1.data.token;
  const B = reg2.data.token;
  const aliceId = reg1.data.user.id;
  const bobId = reg2.data.user.id;

  /* ------------------------------------------------------------- group */
  const made = await call('/groups', {
    method: 'POST', token: A,
    body: { name: `Smoke Flat ${stamp}`, emoji: '🏠', type: 'home' },
  });
  check('created a group', made.status === 201, JSON.stringify(made.data).slice(0, 160));
  const groupId = made.data.group?.id || made.data.group?._id;
  if (!groupId) return;

  const code = made.data.group.code;
  const joined = await call('/groups/join', { method: 'POST', token: B, body: { code } });
  check('second member joined', joined.status === 200 || joined.status === 201,
    JSON.stringify(joined.data).slice(0, 160));

  /* -------------------------------------------------------------- chat */
  const msg = await call(`/groups/${groupId}/messages`, {
    method: 'POST', token: A, body: { text: 'Who paid for the wifi?' },
  });
  check('sent a group message', msg.status === 201);
  const messageId = msg.data.message?.id;

  const react = await call(`/groups/${groupId}/messages/${messageId}/react`, {
    method: 'POST', token: B, body: { emoji: '👍' },
  });
  check('reacted to a message', react.status === 200 && react.data.message.reactions.length === 1);

  const unreact = await call(`/groups/${groupId}/messages/${messageId}/react`, {
    method: 'POST', token: B, body: { emoji: '👍' },
  });
  check('same emoji twice removes the reaction',
    unreact.data.message?.reactions?.length === 0);

  const otherDelete = await call(`/groups/${groupId}/messages/${messageId}`, {
    method: 'DELETE', token: B,
  });
  check('cannot delete someone else\'s message', otherDelete.status === 403,
    `got ${otherDelete.status}`);

  const page = await call(`/groups/${groupId}/messages`, { token: B });
  check('chat pages back', page.status === 200 && page.data.messages.length === 1);

  /* ------------------------------------------- recurring: the real test */
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const rec = await call(`/groups/${groupId}/recurring`, {
    method: 'POST', token: A,
    body: {
      title: 'Smoke Rent', amount: 900, currency: 'INR', category: 'rent',
      frequency: 'monthly', nextDate: yesterday, autoPost: true,
      payer: aliceId, splitWith: [aliceId, bobId],
    },
  });
  check('created an overdue recurring bill', rec.status === 201);
  const recId = rec.data.recurring?.id;

  const before = await call(`/expenses?group=${groupId}`, { token: A });
  const countBefore = before.data.expenses?.length ?? 0;

  /* Both members open the group in the same tick. Exactly one bill must
     appear — this is the claim/compare-and-swap under test. */
  const [sweepA, sweepB] = await Promise.all([
    call(`/groups/${groupId}/engagement`, { token: A }),
    call(`/groups/${groupId}/engagement`, { token: B }),
  ]);
  check('engagement loads for both members',
    sweepA.status === 200 && sweepB.status === 200);

  const after = await call(`/expenses?group=${groupId}`, { token: A });
  const posted = (after.data.expenses || []).filter((e) => e.description === 'Smoke Rent');
  check('overdue bill posted itself as a real expense', posted.length === 1,
    `found ${posted.length}`);
  check('no double-post under a concurrent sweep',
    (after.data.expenses?.length ?? 0) === countBefore + 1,
    `${countBefore} → ${after.data.expenses?.length}`);

  if (posted[0]) {
    const e = posted[0];
    const splits = e.splits || [];
    check('auto-posted bill split evenly across both members',
      splits.length === 2 && Math.abs(splits[0].amount - 450) < 0.01);
    check('auto-posted bill is attributed to the payer',
      String(e.paidBy?.[0]?.user) === String(aliceId));
    check('auto-posted bill is tagged as recurring', !!e.recurring);
  }

  const advanced = (sweepA.data.recurring || []).find((r) => r.id === recId)
    || (sweepB.data.recurring || []).find((r) => r.id === recId);
  check('schedule advanced past the posted cycle',
    advanced && new Date(advanced.nextDate) > new Date(),
    advanced ? advanced.nextDate : 'not found');

  const skipped = await call(`/groups/${groupId}/recurring/${recId}/skip`, {
    method: 'POST', token: A,
  });
  check('skip moves the schedule on a cycle',
    skipped.status === 200 &&
      new Date(skipped.data.recurring.nextDate) > new Date(advanced.nextDate));

  /* Re-opening must not post a second copy — nothing is due any more. */
  await call(`/groups/${groupId}/engagement`, { token: A });
  const after2 = await call(`/expenses?group=${groupId}`, { token: A });
  check('reopening does not repost a bill that is not due',
    (after2.data.expenses || []).filter((e) => e.description === 'Smoke Rent').length === 1);

  /* ---------------------------------------------------------- requests */
  const req = await call(`/groups/${groupId}/requests`, {
    method: 'POST', token: A,
    body: { title: 'Saturday dinner bill', type: 'add_bill', assignee: bobId },
  });
  check('created a split request', req.status === 201);
  const reqId = req.data.request?.id;

  const wrongHands = await call(`/groups/${groupId}/requests/${reqId}`, {
    method: 'PATCH', token: A, body: { status: 'accepted' },
  });
  check('requester may respond to their own request', wrongHands.status === 200);

  const withdrawByAssignee = await call(`/groups/${groupId}/requests/${reqId}`, {
    method: 'PATCH', token: B, body: { status: 'dismissed' },
  });
  check('assignee cannot withdraw the requester\'s ask',
    withdrawByAssignee.status === 403, `got ${withdrawByAssignee.status}`);

  const accepted = await call(`/groups/${groupId}/requests/${reqId}`, {
    method: 'PATCH', token: B, body: { status: 'done' },
  });
  check('assignee can close the request',
    accepted.status === 200 && accepted.data.request.status === 'done');

  /* ------------------------------------------------------------ places */
  const place = await call(`/groups/${groupId}/places`, {
    method: 'POST', token: A,
    body: { name: 'Sagar Ratna', kind: 'restaurant', typicalAmount: 600 },
  });
  check('saved a place', place.status === 201);
  const placeId = place.data.place?.id;

  const used = await call(`/groups/${groupId}/places/${placeId}`, {
    method: 'PATCH', token: B, body: { used: true },
  });
  check('using a place bumps its count', used.data.place?.useCount === 1);

  /* ---------------------------------------------------------- memories */
  const tinyJpeg =
    'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
  const mem = await call(`/groups/${groupId}/memories`, {
    method: 'POST', token: A,
    body: { title: 'Sunset', place: 'Chapora', photo: tinyJpeg },
  });
  check('added a timeline memory with a photo', mem.status === 201 && !!mem.data.memory.photo);

  const badPhoto = await call(`/groups/${groupId}/memories`, {
    method: 'POST', token: A, body: { title: 'Bad', photo: 'javascript:alert(1)' },
  });
  check('rejects a photo that is not an image data URL', badPhoto.status === 400,
    `got ${badPhoto.status}`);

  const hugePhoto = await call(`/groups/${groupId}/memories`, {
    method: 'POST', token: A,
    body: { title: 'Huge', photo: `data:image/jpeg;base64,${'A'.repeat(500 * 1024)}` },
  });
  check('rejects an oversized photo', hugePhoto.status === 413, `got ${hugePhoto.status}`);

  const foreign = await call(`/groups/${groupId}/memories/${mem.data.memory.id}`, {
    method: 'DELETE', token: B,
  });
  check('cannot delete a memory you did not add', foreign.status === 403);

  /* ------------------------------------------------------------ badges */
  const final = await call(`/groups/${groupId}/engagement`, { token: A });
  const badges = final.data.badges || [];
  check('badge shelf comes back populated', badges.length >= 10, `${badges.length} badges`);

  const chatter = badges.find((b) => b.id === 'chatterbox');
  check('badge progress is reported, not just earned/not',
    chatter && chatter.target === 25 && chatter.value >= 1,
    chatter ? `${chatter.value}/${chatter.target}` : 'missing');

  const guide = badges.find((b) => b.id === 'local_guide');
  check('place count feeds the Local Guide badge', guide && guide.value === 1);

  const seen = await call(`/groups/${groupId}/badges/seen`, {
    method: 'POST', token: A, body: { badges: badges.filter((b) => b.earned).map((b) => b.id) },
  });
  check('badges can be marked celebrated', seen.status === 200);

  const again = await call(`/groups/${groupId}/engagement`, { token: A });
  const stillNew = (again.data.badges || []).filter((b) => b.justEarned);
  check('a celebrated badge does not re-fire', stillNew.length === 0,
    `${stillNew.length} still flagged`);

  /* --------------------------------------------------------------- hub */
  const summary = await call('/engagement/summary', { token: A });
  check('cross-group summary loads', summary.status === 200);
  check('summary carries badge names, not bare ids',
    (summary.data.badges || []).every((b) => !!b.name),
    JSON.stringify(summary.data.badges?.[0] || {}).slice(0, 120));
  check('summary reports the badge total', summary.data.badgeTotal >= 10);

  /* -------------------------------------------------------- access ctl */
  const outsider = await call('/auth/register', { method: 'POST', body: account('mallory') });
  const nosy = await call(`/groups/${groupId}/engagement`, { token: outsider.data.token });
  check('a non-member cannot read the group\'s engagement',
    nosy.status === 403 || nosy.status === 404, `got ${nosy.status}`);

  const nosyPost = await call(`/groups/${groupId}/messages`, {
    method: 'POST', token: outsider.data.token, body: { text: 'hello' },
  });
  check('a non-member cannot post to the chat',
    nosyPost.status === 403 || nosyPost.status === 404, `got ${nosyPost.status}`);

  /* ------------------------------------------------------------ tidy up */
  await call(`/groups/${groupId}`, { method: 'DELETE', token: A });
  for (const token of [A, B, outsider.data.token]) {
    await call('/auth/me', { method: 'DELETE', token, body: { password: 'smoke-test-pw-1' } });
  }

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error('\nSmoke run crashed:', err);
  process.exit(1);
});
