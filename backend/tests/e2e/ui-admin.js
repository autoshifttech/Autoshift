// The admin panel against the real API and database: real list (no sample businesses), block, plan, notes, wallet.
const { chromium } = require('playwright');
const fs = require('fs');
const { execSync } = require('child_process');
const login = JSON.parse(fs.readFileSync('/tmp/e2e-login.json', 'utf8'));
const DB = process.env.E2E_DB || 'fresh';
const q = (sql) => execSync(`psql "host=/tmp port=5544 user=postgres dbname=${DB}" -At -c "${sql}"`).toString().trim();
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const api = (method, path, body) => JSON.parse(execSync(`curl -s -X ${method} -H 'Authorization: Bearer ${login.token}' -H 'Content-Type: application/json' ${body ? `-d '${JSON.stringify(body)}'` : ''} localhost:8099${path}`).toString() || '{}');
const NAME = 'Admin UI Shop ' + Date.now().toString(36);

(async () => {
  q(`insert into platform_admins (user_id, role) values ('${login.user_id}', 'super_admin') on conflict do nothing`);
  const made = api('POST', '/v1/platform/businesses', { name: NAME, industry: 'retail', city: 'Pune', owner: { name: 'Asha', email: `asha-${Date.now()}@ui.test` }, plan_id: 'starter' });
  const bid = made.id;
  ok(!!bid, 'a business was created through the API');

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 1000 } });
  await ctx.addCookies([{ name: 'autoshift_demo', value: '1', url: 'http://localhost:3111' }, { name: 'autoshift_admin', value: '1', url: 'http://localhost:3111' }]);
  const p = await ctx.newPage();
  await p.route('http://localhost:8099/**', (route) => route.continue({ headers: { ...route.request().headers(), authorization: `Bearer ${login.token}` } }));
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));

  await p.goto('http://localhost:3111/admin/businesses', { waitUntil: 'networkidle', timeout: 120000 });
  await p.waitForTimeout(2500);
  const list = await p.locator('main').innerText();
  ok(list.includes(NAME), 'the real business is in the list');
  ok(!/Smile Dental Care|Glow Beauty Studio/.test(list), 'the sample businesses are not shown');

  await p.goto(`http://localhost:3111/admin/businesses/${bid}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  await p.screenshot({ path: '/tmp/claude-0/admin-1.png' });
  ok((await p.locator('main').innerText()).includes(NAME), 'the detail page opens from the server');

  // Notes tab
  await p.getByRole('tab', { name: /^Notes/ }).click().catch(async () => p.getByText(/^Notes/).first().click());
  await p.getByRole('textbox').last().fill('Wants a demo on Friday');
  await p.getByRole('button', { name: /add note|save note/i }).click();
  await p.waitForTimeout(2000);
  ok(q(`select text from business_notes where account_id='${bid}'`) === 'Wants a demo on Friday', 'an admin note is saved on the server');
  ok(/Wants a demo on Friday/.test(await p.locator('main').innerText()), 'the note shows on the page');


  const dlg = () => p.getByRole('dialog');
  // Extend trial by 7 days
  await p.getByRole('button', { name: 'Extend trial' }).first().click();
  await dlg().getByRole('button', { name: 'Extend trial' }).click();
  await p.waitForTimeout(2000);
  ok(Number(q(`select extract(day from trial_ends_at - now()) from subscriptions where account_id='${bid}'`)) >= 20, 'extending the trial moved the real trial end date');

  // Add credits
  await p.getByRole('button', { name: 'Adjust credits' }).click();
  await dlg().locator('#credit-amount').fill('250');
  await dlg().locator('#credit-reason').fill('Sorry for the delay');
  await dlg().getByRole('button', { name: /^(Add|Apply|Confirm|Save)/ }).last().click();
  await p.waitForTimeout(2000);
  ok(q(`select balance_paise from wallet_balances where account_id='${bid}'`) === '25000', 'credits were added to the real wallet (₹250)');
  ok(q(`select count(*) from wallet_ledger where account_id='${bid}' and kind='adjustment'`) === '1', 'the ledger shows one adjustment');

  // Block
  await p.getByRole('button', { name: 'Block', exact: true }).click();
  await dlg().locator('#block-reason').fill('Spam complaints');
  await dlg().getByRole('button', { name: 'Block business' }).click();
  await p.waitForTimeout(2000);
  ok(q(`select status||'/'||suspended_reason from accounts where id='${bid}'`) === 'suspended/Spam complaints', 'blocking suspended the real business');
  ok(/Blocked/i.test(await p.locator('main').innerText()), 'the page shows it as blocked');

  // Unblock
  await p.getByRole('button', { name: /Unblock/ }).click();
  await p.waitForTimeout(2000);
  ok(q(`select status from accounts where id='${bid}'`) === 'active', 'unblocking restored it');

  // Audit trail written by the server
  ok(Number(q(`select count(*) from audit_log where account_id='${bid}' and scope='platform'`)) >= 4, 'every admin action was written to the server audit log');

  // Delete is refused while the business has payment history (money records must be kept)
  await p.getByRole('button', { name: 'Delete', exact: true }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Delete business' }).click();
  await p.waitForTimeout(2500);
  ok(q(`select count(*) from accounts where id='${bid}'`) === '1', 'a business with payment history is not deleted');

  // A business with no money history can be deleted
  const clean = api('POST', '/v1/platform/businesses', { name: NAME + ' (empty)', industry: 'retail', city: 'Pune', owner: { name: 'Zed', email: `zed-${Date.now()}@ui.test` }, plan_id: 'starter' });
  await p.goto(`http://localhost:3111/admin/businesses/${clean.id}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await p.getByRole('button', { name: 'Delete', exact: true }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Delete business' }).click();
  await p.waitForTimeout(2500);
  ok(q(`select count(*) from accounts where id='${clean.id}'`) === '0', 'a business with no payment history is deleted from the real database');
  await b.close();
})();
