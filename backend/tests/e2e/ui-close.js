// Data & privacy: the owner schedules deleting the business on the server, nothing is removed yet, then cancels.
const { chromium } = require('playwright');
const fs = require('fs');
const { execSync } = require('child_process');
const login = JSON.parse(fs.readFileSync('/tmp/e2e-login.json', 'utf8'));
const DB = process.env.E2E_DB || 'fresh';
const q = (sql) => execSync(`psql "host=/tmp port=5544 user=postgres dbname=${DB}" -At -c "${sql}"`).toString().trim();
const acct = `(select account_id from profiles where user_id='${login.user_id}')`;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };

(async () => {
  const name = q(`select name from accounts where id=${acct}`);
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([{ name: 'autoshift_demo', value: '1', url: 'http://localhost:3111' }]);
  const p = await ctx.newPage();
  await p.route('http://localhost:8099/**', (route) => route.continue({ headers: { ...route.request().headers(), authorization: `Bearer ${login.token}` } }));
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await p.goto('http://localhost:3111/settings?tab=privacy', { waitUntil: 'networkidle', timeout: 120000 });
  await p.waitForTimeout(2000);
  await p.getByRole('button', { name: /Delete workspace|Delete business|Delete account/ }).first().click();
  await p.locator('#del-reason').click(); await p.getByRole('option').nth(1).click();
  await p.locator('#del-name').fill(name);
  await p.getByRole('dialog').getByRole('button', { name: /Delete/ }).click();
  await p.waitForTimeout(2000);
  const after = q(`select extract(day from close_after - now()) from accounts where id=${acct}`);
  ok(Number(after) >= 29, `deletion is scheduled on the server ${after} days out`);
  ok(q(`select status from accounts where id=${acct}`) === 'active', 'nothing is deleted during the grace period');
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await p.getByRole('button', { name: /Cancel deletion|Keep/ }).first().click();
  await p.waitForTimeout(1500);
  ok(q(`select close_after is null from accounts where id=${acct}`) === 't', 'cancelling clears it on the server');
  await b.close();
})();
