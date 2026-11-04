// Drives the real assistants screens against the real API and database.
//   1) E2E_PG_DSN=... python -m tests.e2e.serve      (backend/, serves :8099 and writes /tmp/e2e-login.json)
//   2) NEXT_PUBLIC_API_URL=http://localhost:8099 npx next dev -p 3111
//   3) node backend/tests/e2e/ui-assistants.js
// The demo session has a fake token, so requests to the API get a real one for the test user.
const { chromium } = require('playwright');
const fs = require('fs');
const { execSync } = require('child_process');
const login = JSON.parse(fs.readFileSync('/tmp/e2e-login.json', 'utf8'));
const q = (sql) => execSync(`psql "host=/tmp port=5544 user=postgres dbname=${process.env.E2E_DB || "fresh"}" -At -c "${sql}"`).toString().trim();
const names = () => q(`select string_agg(name, '|' order by created_at) from assistants where account_id=(select account_id from profiles where user_id='${login.user_id}')`);
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };

(async () => {
  execSync(`curl -s -X POST -H 'Authorization: Bearer ${login.token}' -H 'Content-Type: application/json' -d '{"name":"Server bot"}' localhost:8099/v1/assistants`);
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([{ name: 'autoshift_demo', value: '1', url: 'http://localhost:3111' }]);
  const p = await ctx.newPage();
  await p.route('http://localhost:8099/**', (route) => route.continue({ headers: { ...route.request().headers(), authorization: `Bearer ${login.token}` } }));
  const calls = [];
  p.on('request', (r) => r.url().startsWith('http://localhost:8099') && r.method() !== 'OPTIONS' && calls.push(`${r.method()} ${new URL(r.url()).pathname.replace(/[0-9a-f-]{36}/, ':id')}`));
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));

  await p.goto('http://localhost:3111/agents', { waitUntil: 'networkidle', timeout: 120000 });
  await p.waitForTimeout(1500);
  const text = await p.locator('main').innerText();
  ok(!/Sales assistant|Support assistant/.test(text), 'browser sample assistants are not shown');
  ok(/Server bot/.test(text), 'the assistant that exists on the server is shown');

  await p.getByRole('button', { name: /new assistant/i }).first().click();
  await p.waitForURL(/\/agents\/[0-9a-f-]{36}/, { timeout: 15000 });
  await p.waitForTimeout(1500);
  ok(names() === 'Server bot|New assistant', 'a new assistant is created in the real database');

  const box = p.getByRole('textbox').first();
  await box.fill('Renamed by UI');
  await p.waitForTimeout(2000);
  ok(names() === 'Server bot|Renamed by UI', 'typing a name is saved to the real database (one debounced update)');

  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  ok((await p.locator('body').innerText()).includes('Renamed by UI') || (await p.locator('input').first().inputValue()) === 'Renamed by UI', 'after a reload the name comes back from the server');
  await p.evaluate(() => localStorage.clear());
  await p.goto('http://localhost:3111/agents', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  ok(/Renamed by UI/.test(await p.locator('main').innerText()), 'with browser storage cleared, the list still comes from the server');
  console.log('API calls:', calls.join(' , '));
  await b.close();
})();
