// Flow connections against the real API and database: the secret is sent once and stored only encrypted.
const { chromium } = require('playwright');
const fs = require('fs');
const { execSync } = require('child_process');
const login = JSON.parse(fs.readFileSync('/tmp/e2e-login.json', 'utf8'));
const DB = process.env.E2E_DB || 'fresh';
const q = (sql) => execSync(`psql "host=/tmp port=5544 user=postgres dbname=${DB}" -At -c "${sql}"`).toString().trim();
const acct = `(select account_id from profiles where user_id='${login.user_id}')`;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const SECRET = 'rzpSecretValue12345XYZ';

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([{ name: 'autoshift_demo', value: '1', url: 'http://localhost:3111' }]);
  const p = await ctx.newPage();
  await p.route('http://localhost:8099/**', (route) => route.continue({ headers: { ...route.request().headers(), authorization: `Bearer ${login.token}` } }));
  const bodies = [];
  p.on('response', async (r) => { if (r.url().includes(':8099') && r.request().method() === 'GET') bodies.push(await r.text().catch(() => '')); });
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));

  await p.goto('http://localhost:3111/flows/connections', { waitUntil: 'networkidle', timeout: 120000 });
  await p.waitForTimeout(1500);
  ok(!/Cashfree/.test(await p.locator('main').innerText()), 'Cashfree is no longer offered');
  await p.getByRole('button', { name: /Add another/ }).click();
  ok(!(await p.getByRole('menuitem', { name: /Cashfree/ }).count()), 'the menu has no Cashfree option');
  await p.getByRole('menuitem', { name: /Razorpay/ }).click();
  await p.locator('#rzp-name').fill('Shop payments');
  await p.locator('#rzp-id').fill('rzp_test_AbCdEf123456');
  await p.locator('#rzp-secret').fill(SECRET);
  await p.getByRole('dialog').getByRole('button', { name: /Verify and add|Check and add|add/i }).last().click();
  await p.waitForTimeout(2000);

  const row = q(`select name||'|'||detail||'|'||mode from flow_connections where account_id=${acct} and kind='razorpay' order by created_at desc limit 1`);
  ok(row.startsWith('Shop payments|') && row.endsWith('|test') && !row.includes('AbCdEf123456'), `the connection is saved with a masked key id (${row})`);
  const cipher = q(`select s.ciphertext from flow_connection_secrets s join flow_connections c on c.id=s.connection_id where c.account_id=${acct} order by c.created_at desc limit 1`);
  ok(cipher.startsWith('py1:') && !cipher.includes(SECRET), 'the key secret is stored encrypted only');
  ok(/Shop payments/.test(await p.locator('main').innerText()), 'the card shows on the page');
  ok(!bodies.some((t) => t.includes(SECRET) || t.includes('ciphertext')), 'the secret never comes back from the API');
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  ok(/Shop payments/.test(await p.locator('main').innerText()), 'after clearing browser storage the list still comes from the server');

  await p.getByRole('button', { name: /Remove Shop payments|Shop payments/ }).last().click();
  await p.getByRole('dialog').getByRole('button', { name: /^Remove/ }).click();
  await p.waitForTimeout(2000);
  ok(q(`select count(*) from flow_connections where account_id=${acct} and name='Shop payments'`) === '0', 'removing deletes it on the server');
  ok(q(`select count(*) from flow_connection_secrets s where not exists (select 1 from flow_connections c where c.id=s.connection_id)`) === '0', 'its secret went with it');
  await b.close();
})();
