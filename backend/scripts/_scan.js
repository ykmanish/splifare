/*
 * Scan endpoint tests: auth, validation, limits, and the disabled path.
 *
 * The live model call is only exercised when ANTHROPIC_API_KEY is set —
 * without it the route is supposed to refuse cleanly, which is itself a test.
 */
const API = 'http://localhost:5000/api';
const S = Date.now().toString().slice(-7);
const PW = 'supersecret123';

let pass = 0;
const fails = [];
const ok = (label, cond, extra = '') => {
  if (cond) { pass++; console.log('  PASS ' + label); }
  else { fails.push(label); console.log('  FAIL ' + label + (extra ? '  <- ' + extra : '')); }
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
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, body: json, headers: res.headers };
}

/** A valid-looking base64 JPEG payload of roughly `kb` kilobytes. */
const fakeImage = (kb) => 'A'.repeat(Math.floor((kb * 1024 * 4) / 3));

(async () => {
  const email = `scan.${S}@scantest.dev`;
  const reg = await call('POST', '/auth/register', { name: 'Scan Tester', email, password: PW });
  const token = reg.body.token;
  ok('setup: account created', !!token, JSON.stringify(reg.body));

  console.log('\n=== auth ===');
  ok('status needs a token', (await call('GET', '/scan/status')).status === 401);
  ok('receipt needs a token', (await call('POST', '/scan/receipt', { images: [] })).status === 401);

  console.log('\n=== status ===');
  const status = await call('GET', '/scan/status', null, token);
  ok('status answers 200', status.status === 200, String(status.status));
  ok('it says whether scanning is on', typeof status.body.enabled === 'boolean',
    JSON.stringify(status.body));
  ok('a scan response is never cached', /no-store/.test(status.headers.get('cache-control') || ''),
    status.headers.get('cache-control'));

  const enabled = status.body.enabled;
  console.log(`  (scanning is ${enabled ? 'ENABLED' : 'DISABLED'} on this server)`);

  if (!enabled) {
    console.log('\n=== with no API key configured ===');
    const refused = await call('POST', '/scan/receipt',
      { images: [{ mediaType: 'image/jpeg', data: fakeImage(20) }] }, token);
    ok('scanning refuses with 503', refused.status === 503, String(refused.status));
    ok('and says so in plain words', /not set up/.test(refused.body?.error || ''),
      refused.body?.error);
    ok('remainingToday is 0 when disabled', status.body.remainingToday === 0,
      String(status.body.remainingToday));
  }

  console.log('\n=== validation (runs regardless of the key) ===');
  const cases = [
    ['no images at all', { images: [] }, 400],
    ['images missing', {}, 400],
    ['four images', { images: Array(4).fill({ mediaType: 'image/jpeg', data: fakeImage(10) }) }, 400],
    ['a PDF', { images: [{ mediaType: 'application/pdf', data: fakeImage(10) }] }, 400],
    ['a GIF', { images: [{ mediaType: 'image/gif', data: fakeImage(10) }] }, 400],
    ['not base64', { images: [{ mediaType: 'image/jpeg', data: '!!!! not base64 !!!!' + 'x'.repeat(2000) }] }, 400],
    ['too small to be an image', { images: [{ mediaType: 'image/jpeg', data: 'AAAA' }] }, 400],
    ['one oversized image', { images: [{ mediaType: 'image/jpeg', data: fakeImage(1700) }] }, 413],
    ['three images over the combined cap', {
      images: Array(3).fill({ mediaType: 'image/jpeg', data: fakeImage(1450) }),
    }, 413],
  ];

  for (const [label, body, want] of cases) {
    // Validation runs before the enabled check only when enabled; when the
    // server has no key the 503 comes first, which is also correct.
    const r = await call('POST', '/scan/receipt', body, token);
    const got = r.status;
    ok(`${label} -> ${want}${enabled ? '' : ' (or 503 with no key)'}`,
      got === want || (!enabled && got === 503),
      `${got} ${JSON.stringify(r.body)}`);
  }

  console.log('\n=== body limits ===');
  // The scan route takes 6mb; every other route must still be capped at 1mb.
  const big = { images: [{ mediaType: 'image/jpeg', data: fakeImage(3000) }] };
  const scanBig = await call('POST', '/scan/receipt', big, token);
  // The proof that the scoped 6mb parser is in front: a 4mb body reaches OUR
  // handler. Had the global 1mb parser taken it, the error would be
  // body-parser's own "request entity too large", not one of these.
  ok('a 4mb body reaches the scan route, past the global 1mb limit',
    /too large|not set up/i.test(scanBig.body?.error || ''),
    `${scanBig.status} ${JSON.stringify(scanBig.body)}`);
  ok('and it is our message, not body-parser own',
    !/request entity too large/i.test(scanBig.body?.error || ''),
    scanBig.body?.error);

  const otherBig = await call('POST', '/expenses',
    { description: 'x'.repeat(2 * 1024 * 1024), amount: 1 }, token);
  ok('the global 1mb limit still guards other routes', otherBig.status === 413,
    String(otherBig.status));

  if (enabled) {
    console.log('\n=== a real read ===');
    const fs = require('fs');
    const path = process.env.SCAN_FIXTURE;
    if (path && fs.existsSync(path)) {
      const data = fs.readFileSync(path).toString('base64');
      const type = path.endsWith('.png') ? 'image/png' : 'image/jpeg';
      const started = Date.now();
      const r = await call('POST', '/scan/receipt',
        { images: [{ mediaType: type, data }], currency: 'INR' }, token);
      console.log(`  took ${Math.round((Date.now() - started) / 100) / 10}s`);
      console.log('  ' + JSON.stringify(r.body, null, 2).split('\n').join('\n  '));
      ok('a real receipt returns 200', r.status === 200, String(r.status));
      ok('items came back', (r.body?.items || []).length > 0);
      ok('every price is 2dp',
        (r.body?.items || []).every((i) => Number.isFinite(i.price) && Math.round(i.price * 100) === i.price * 100),
        JSON.stringify((r.body?.items || []).map((i) => i.price)));
      ok('itemsTotal is the server\'s own sum',
        r.body?.itemsTotal ===
          Math.round((r.body?.items || []).reduce((t, i) => t + i.price, 0) * 100) / 100);
    } else {
      console.log('  (set SCAN_FIXTURE=<path to a receipt image> to exercise a real read)');
    }
  }

  console.log('\n=== cleanup ===');
  await call('DELETE', '/auth/me', { password: PW, confirm: email }, token);
  console.log('  test account closed');

  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) fails.forEach((f) => console.log('   x ' + f));
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('THREW', e); process.exit(1); });
