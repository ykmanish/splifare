/**
 * Seed one demo account with a group rich enough to exercise the Engage tab.
 *
 * Development aid only — it drives the public API exactly as the app does, so
 * whatever it produces is reachable by hand too.
 *
 *   node scripts/seed-engage-demo.js <token>
 */

require('dotenv').config({ quiet: true });

const BASE = process.env.SMOKE_API || 'http://localhost:5000/api';
const TOKEN = process.argv[2];

if (!TOKEN) {
  console.error('Usage: node scripts/seed-engage-demo.js <token>');
  process.exit(1);
}

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(data)}`);
  return data;
}

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

async function main() {
  const { user } = await call('/auth/me');
  const me = user.id;
  console.log('seeding for', user.name);

  const { group } = await call('/groups', {
    method: 'POST',
    body: { name: 'Goa Trip', emoji: '🏝️', type: 'trip' },
  });
  console.log('group', group.id);

  /* A second member, joined by code, so splits and games have someone else. */
  const mate = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Riya Menon',
      email: `riya.${Date.now()}@example.test`,
      password: 'demo-password-1',
    }),
  }).then((r) => r.json());

  await fetch(`${BASE}/groups/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mate.token}` },
    body: JSON.stringify({ code: group.code }),
  });
  const riya = mate.user.id;
  console.log('added Riya', riya);

  const bills = [
    ['Beach shack lunch 🦐', 2400, 'food', 1],
    ['Scooter rental', 1200, 'transport', 2],
    ['THE GREAT SEAFOOD INCIDENT!!', 5600, 'food', 3],
    ['Hostel, three nights', 7200, 'travel', 4],
    ['Petrol', 800, 'transport', 5],
    ['Sunset cruise', 3000, 'entertainment', 6],
    ['Coffee', 320, 'cafe', 7],
    ['Groceries', 1850, 'groceries', 9],
    ['Airport cab', 1400, 'transport', 12],
    ['Dinner at Britto&rsquo;s', 3200, 'food', 14],
    ['Museum tickets', 600, 'entertainment', 18],
    ['Ferry', 450, 'transport', 22],
    ['Late night momos (worth it)', 380, 'food', 26],
    ['Rent share', 9000, 'rent', 34],
    ['Wifi', 1100, 'internet', 36],
  ];

  for (const [description, amount, category, ago] of bills) {
    const payer = Math.random() > 0.4 ? me : riya;
    const half = Math.round((amount / 2) * 100) / 100;
    await call('/expenses', {
      method: 'POST',
      body: {
        groupId: group.id,
        description: description.replace('&rsquo;', "'"),
        amount,
        currency: 'INR',
        category,
        date: daysAgo(ago),
        paidBy: [{ userId: payer, amount }],
        splits: [
          { userId: me, amount: half },
          { userId: riya, amount: amount - half },
        ],
        splitMode: 'equal',
      },
    });
  }
  console.log(`${bills.length} expenses`);

  /* An itemised bill, so Receipt Master has something to count. */
  await call('/expenses', {
    method: 'POST',
    body: {
      groupId: group.id,
      description: 'Supermarket run',
      amount: 900,
      currency: 'INR',
      category: 'groceries',
      date: daysAgo(8),
      paidBy: [{ userId: me, amount: 900 }],
      splits: [
        { userId: me, amount: 450 },
        { userId: riya, amount: 450 },
      ],
      splitMode: 'items',
      items: [
        { name: 'Water crate', price: 300 },
        { name: 'Snacks', price: 400 },
        { name: 'Sunscreen', price: 200 },
      ],
    },
  });

  await call('/settlements', {
    method: 'POST',
    body: { from: me, to: riya, amount: 1500, currency: 'INR', groupId: group.id, note: 'Part payment' },
  });

  for (const text of [
    'Who has the scooter keys?',
    'I paid for the shack lunch, added it here',
    'The seafood bill was WILD 😅',
    'Can someone add the ferry tickets?',
  ]) {
    await call(`/groups/${group.id}/messages`, { method: 'POST', body: { text } });
  }

  await call(`/groups/${group.id}/recurring`, {
    method: 'POST',
    body: {
      title: 'Rent', amount: 18000, category: 'rent', frequency: 'monthly',
      nextDate: new Date(Date.now() + 4 * 86400000).toISOString(),
      autoPost: true, payer: me, splitWith: [me, riya],
    },
  });
  await call(`/groups/${group.id}/recurring`, {
    method: 'POST',
    body: {
      title: 'Wi-Fi', amount: 1100, category: 'internet', frequency: 'monthly',
      nextDate: new Date(Date.now() + 11 * 86400000).toISOString(),
      autoPost: true, payer: riya, splitWith: [me, riya],
    },
  });
  await call(`/groups/${group.id}/recurring`, {
    method: 'POST',
    body: {
      title: 'Phone bill', amount: 0, category: 'internet', frequency: 'monthly',
      nextDate: new Date(Date.now() + 20 * 86400000).toISOString(),
      autoPost: false, payer: me, splitWith: [me],
    },
  });

  await call(`/groups/${group.id}/requests`, {
    method: 'POST',
    body: { title: 'The ferry tickets', type: 'add_bill', details: 'You tapped the card at the pier' },
  });

  for (const place of [
    { name: 'Britto&rsquo;s', kind: 'restaurant', typicalAmount: 1600, note: 'Ask for a beach table' },
    { name: 'Cafe Bodega', kind: 'cafe', typicalAmount: 450 },
    { name: 'Newton&rsquo;s Supermarket', kind: 'grocery', typicalAmount: 1800 },
    { name: 'Rahul (scooters)', kind: 'transport', typicalAmount: 400 },
  ]) {
    const { place: saved } = await call(`/groups/${group.id}/places`, {
      method: 'POST',
      body: { ...place, name: place.name.replace('&rsquo;', "'") },
    });
    const uses = Math.floor(Math.random() * 5);
    for (let i = 0; i < uses; i += 1) {
      await call(`/groups/${group.id}/places/${saved.id}`, { method: 'PATCH', body: { used: true } });
    }
  }

  for (const memory of [
    { title: 'Sunset at Chapora', place: 'Chapora Fort', note: 'Everyone was late except Riya', date: daysAgo(3) },
    { title: 'The seafood', place: "Britto's", note: 'We regret nothing', date: daysAgo(3) },
    { title: 'Scooter convoy', place: 'Anjuna', date: daysAgo(5) },
  ]) {
    await call(`/groups/${group.id}/memories`, { method: 'POST', body: memory });
  }

  console.log('\nseeded — open /groups/' + group.id + '?tab=engage');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
