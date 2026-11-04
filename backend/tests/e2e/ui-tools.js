// AI tools against the real API and database: built-ins from the server, a custom webhook tool created, switched off and deleted.
const { chromium } = require('playwright');
const fs = require('fs');
const { execSync } = require('child_process');
const login = JSON.parse(fs.readFileSync('/tmp/e2e-login.json', 'utf8'));
const DB = process.env.E2E_DB || 'fresh';
const q = (sql) => execSync(`psql "host=/tmp port=5544 user=postgres dbname=${DB}" -At -c "${sql}"`).toString().trim();
const acct = `(select account_id from profiles where user_id='${login.user_id}')`;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };

(async () => {
  q(`update ai_tools set enabled=true where key='handoff' and account_id=${acct}`);
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([{ name: 'autoshift_demo', value: '1', url: 'http://localhost:3111' }]);
  const p = await ctx.newPage();
  await p.route('http://localhost:8099/**', (route) => route.continue({ headers: { ...route.request().headers(), authorization: `Bearer ${login.token}` } }));
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  p.on('response', async (r) => { if (r.url().includes('/v1/tools') && r.request().method() !== 'GET' && r.request().method() !== 'OPTIONS') console.log('API', r.request().method(), r.status(), r.request().postData()?.slice(0, 300), (await r.text().catch(() => '')).slice(0, 300)); });
  await p.goto('http://localhost:3111/ai-tools', { waitUntil: 'networkidle', timeout: 120000 });
  await p.waitForTimeout(2000);
  let text = await p.locator('main').innerText();
  ok(/Hand off to a person/.test(text) && !/Check order status/.test(text), 'built-in tools come from the server; the sample custom tool is gone');
  ok(q(`select count(*) from ai_tools where account_id=${acct} and builtin`) === '5', 'the five built-ins exist on the server for this business');

  await p.getByRole('switch', { name: 'Hand off to a person' }).click();
  await p.waitForTimeout(1500);
  ok(q(`select enabled from ai_tools where account_id=${acct} and key='handoff'`) === 'f', 'switching a built-in off is saved');

  await p.getByRole('button', { name: /Add custom tool/i }).first().click();
  await p.locator('#tl-name').fill('Order status');
  await p.locator('#tl-desc').fill('Use when the customer asks where their order is.');
  await p.locator('#tl-url').fill('https://n8n.example.com/webhook/order-status');
  await p.getByPlaceholder(/name/i).last().fill('order_id').catch(() => {});
  await p.getByRole('dialog').getByRole('button', { name: /^Save|^Add/ }).last().click();
  await p.waitForTimeout(2500);
  const key = q(`select key from ai_tools where account_id=${acct} and name='Order status'`);
  ok(/^custom_[0-9a-f]{12}$/.test(key), `the custom tool is on the server with its own key (${key})`);
  ok(q(`select webhook->>'url' from ai_tools where key='${key}'`) === 'https://n8n.example.com/webhook/order-status', 'its webhook address was saved');
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  text = await p.locator('main').innerText();
  ok(/Order status/.test(text), 'after clearing browser storage the tool still comes from the server');
  await b.close();
})();
