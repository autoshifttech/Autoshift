// Support inbox across both sides against the real API and database; staff notes never reach the business.
const { chromium } = require('playwright');
const fs = require('fs');
const { execSync } = require('child_process');
const login = JSON.parse(fs.readFileSync('/tmp/e2e-login.json', 'utf8'));
const DB = process.env.E2E_DB || 'fresh';
const q = (sql) => execSync(`psql "host=/tmp port=5544 user=postgres dbname=${DB}" -At -c "${sql}"`).toString().trim();
const acct = `(select account_id from profiles where user_id='${login.user_id}')`;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const SUBJ = 'Template rejected ' + Date.now().toString(36);

(async () => {
  q(`insert into platform_admins (user_id, role) values ('${login.user_id}', 'super_admin') on conflict do nothing`);
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 1000 } });
  await ctx.addCookies([{ name: 'autoshift_demo', value: '1', url: 'http://localhost:3111' }, { name: 'autoshift_admin', value: '1', url: 'http://localhost:3111' }]);
  const p = await ctx.newPage();
  await p.route('http://localhost:8099/**', (route) => route.continue({ headers: { ...route.request().headers(), authorization: `Bearer ${login.token}` } }));
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));

  // business opens a request
  await p.goto('http://localhost:3111/support', { waitUntil: 'networkidle', timeout: 120000 });
  await p.waitForTimeout(1500);
  ok(!/T-1043|Template got rejected/.test(await p.locator('main').innerText()), 'no sample tickets are shown');
  await p.getByRole('button', { name: 'New request' }).first().click();
  await p.locator('#sr-cat').click(); await p.getByRole('option').nth(2).click();
  await p.locator('#sr-subject').fill(SUBJ);
  await p.locator('#sr-message').fill('Our order template keeps getting rejected by Meta.');
  await p.getByRole('button', { name: 'Send request' }).click();
  await p.waitForTimeout(2000);
  const num = q(`select number from support_tickets where account_id=${acct} and subject='${SUBJ}'`);
  ok(/^\d+$/.test(num), `the request is a real ticket (T-${num})`);

  // staff: internal note, then a reply
  await p.goto('http://localhost:3111/admin/support', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  await p.getByText(SUBJ).first().click();
  await p.waitForTimeout(800);
  await p.getByRole('radio', { name: 'Internal note' }).click().catch(async () => p.getByText('Internal note', { exact: true }).click());
  await p.getByRole('textbox', { name: 'Internal note' }).fill('Check if they used a discount code');
  await p.getByRole('button', { name: /^Send|^Add note/ }).first().click();
  await p.waitForTimeout(1500);
  await p.getByText('Reply', { exact: true }).first().click();
  await p.getByRole('textbox', { name: 'Reply' }).fill('Please remove the discount code and resubmit.');
  await p.getByRole('button', { name: /^Send/ }).last().click();
  await p.waitForTimeout(2000);
  ok(q(`select string_agg(sender, ',' order by id) from support_messages where ticket=${num}`) === 'business,note,admin', 'the note and the reply are saved in order');
  ok(q(`select status from support_tickets where number=${num}`) === 'pending', 'replying sets it to waiting on the business');

  // business sees the reply but never the note
  await p.goto('http://localhost:3111/support', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await p.getByText(SUBJ).first().click();
  await p.waitForTimeout(800);
  const view = await p.locator('main').innerText();
  ok(/remove the discount code/.test(view), 'the business sees the reply');
  ok(!/Check if they used a discount code/.test(view), 'the business never sees the internal note');

  // audit page shows real server entries
  await p.goto('http://localhost:3111/admin/audit', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  const audit = await p.locator('main').innerText();
  ok(/Support reply|Support note/.test(audit) && !/2-step code verified/.test(audit), 'the audit page shows the server log, not sample entries');
  await b.close();
})();
