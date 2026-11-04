// Admin: the "who pays Meta" switch against the real API and database.
const { chromium } = require('playwright');
const fs = require('fs');
const { execSync } = require('child_process');
const login = JSON.parse(fs.readFileSync('/tmp/e2e-login.json', 'utf8'));
const DB = process.env.E2E_DB || 'fresh';
const q = (sql) => execSync(`psql "host=/tmp port=5544 user=postgres dbname=${DB}" -At -c "${sql}"`).toString().trim();
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };

(async () => {
  q(`insert into platform_admins (user_id, role) values ('${login.user_id}', 'super_admin') on conflict do nothing`);
  q(`update platform_settings set value=to_jsonb('business'::text) where key='meta_fees_billed_to'`);
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 1000 } });
  await ctx.addCookies([{ name: 'autoshift_demo', value: '1', url: 'http://localhost:3111' }, { name: 'autoshift_admin', value: '1', url: 'http://localhost:3111' }]);
  const p = await ctx.newPage();
  await p.route('http://localhost:8099/**', (route) => route.continue({ headers: { ...route.request().headers(), authorization: `Bearer ${login.token}` } }));
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await p.goto('http://localhost:3111/admin/wallet', { waitUntil: 'networkidle', timeout: 120000 });
  await p.waitForTimeout(2000);
  const on = p.getByRole('radio', { name: /Each business pays Meta/ });
  ok((await on.getAttribute('aria-checked')) === 'true', 'the switch shows the server setting (each business pays Meta)');
  await p.getByRole('radio', { name: /AutoShift pays Meta/ }).click();
  await p.waitForTimeout(1500);
  ok(q(`select value #>> '{}' from platform_settings where key='meta_fees_billed_to'`) === 'autoshift', 'choosing the credit line is saved on the server');
  ok(q(`select count(*) from audit_log where action='settings.meta_fees'`) !== '0', 'the change is in the audit log');
  await p.getByRole('radio', { name: /Each business pays Meta/ }).click();
  await p.waitForTimeout(1500);
  ok(q(`select value #>> '{}' from platform_settings where key='meta_fees_billed_to'`) === 'business', 'switching back is saved too');
  await p.screenshot({ path: '/tmp/claude-0/meta-fees.png' });
  await b.close();
})();
