// Announcements and the admin team against the real API and database.
const { chromium } = require('playwright');
const fs = require('fs');
const { execSync } = require('child_process');
const login = JSON.parse(fs.readFileSync('/tmp/e2e-login.json', 'utf8'));
const DB = process.env.E2E_DB || 'fresh';
const q = (sql) => execSync(`psql "host=/tmp port=5544 user=postgres dbname=${DB}" -At -c "${sql}"`).toString().trim();
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const TITLE = 'Maintenance ' + Date.now().toString(36);
const EMAIL = `sara-${Date.now()}@autoshift.test`;

(async () => {
  q(`insert into platform_admins (user_id, role) values ('${login.user_id}', 'super_admin') on conflict do nothing`);
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 1000 } });
  await ctx.addCookies([{ name: 'autoshift_demo', value: '1', url: 'http://localhost:3111' }, { name: 'autoshift_admin', value: '1', url: 'http://localhost:3111' }]);
  const p = await ctx.newPage();
  await p.route('http://localhost:8099/**', (route) => route.continue({ headers: { ...route.request().headers(), authorization: `Bearer ${login.token}` } }));
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  p.on('response', async (r) => { if (r.url().includes('announcements') && !['GET','OPTIONS'].includes(r.request().method())) console.log('API', r.request().method(), r.status(), (r.request().postData()||'').slice(0,200), (await r.text().catch(()=>'')).slice(0,200)); });

  await p.goto('http://localhost:3111/admin/announcements', { waitUntil: 'networkidle', timeout: 120000 });
  await p.waitForTimeout(2000);
  ok(!/Drip campaigns are here/.test(await p.locator('main').innerText()), 'no sample announcements');
  await p.getByRole('button', { name: /New announcement/ }).first().click();
  await p.locator('#an-title').fill(TITLE);
  await p.locator('#an-body').fill('Sending may be delayed for a few minutes.');
  await p.getByRole('dialog').getByRole('button', { name: /^(Publish|Schedule|Save draft)$/ }).click();
  await p.waitForTimeout(2000);
  ok(q(`select draft from announcements where title='${TITLE}'`) === 'f', 'the announcement was published on the server');
  const seen = await p.evaluate(async (tok) => (await fetch('http://localhost:8099/v1/announcements', { headers: { Authorization: 'Bearer ' + tok } })).json(), login.token);
  ok(seen.some((a) => a.title === TITLE), 'a business now receives it');
  await p.getByRole('button', { name: 'Unpublish' }).first().click();
  await p.waitForTimeout(1500);
  ok(q(`select draft from announcements where title='${TITLE}'`) === 't', 'unpublishing moved it back to drafts');

  await p.goto('http://localhost:3111/admin/team', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  ok(!/Deepa Krishnan|Nikhil Bose/.test(await p.locator('main').innerText()), 'no sample admin team');
  await p.getByRole('button', { name: 'Invite admin' }).click();
  await p.locator('#inv-name').fill('Sara');
  await p.locator('#inv-email').fill(EMAIL);
  await p.getByRole('button', { name: 'Send invite' }).click();
  await p.waitForTimeout(2500);
  ok(q(`select pa.role from platform_admins pa join auth.users u on u.id=pa.user_id where u.email='${EMAIL}'`) === 'support', 'the new admin is on the server team (support role)');
  ok(Number(q(`select count(*) from audit_log where action in ('admin.add','announcement.create','announcement.update')`)) >= 3, 'each change is in the audit log');
  await b.close();
})();
