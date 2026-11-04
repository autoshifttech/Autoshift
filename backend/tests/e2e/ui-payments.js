// Admin payments against the real API and database, including a refund request.
const { chromium } = require('playwright');
const crypto = require('crypto');
const fs = require('fs');
const { execSync } = require('child_process');
const login = JSON.parse(fs.readFileSync('/tmp/e2e-login.json', 'utf8'));
const DB = process.env.E2E_DB || 'fresh';
const q = (sql) => execSync(`psql "host=/tmp port=5544 user=postgres dbname=${DB}" -At -c "${sql}"`).toString().trim();
const api = (m, path, body) => JSON.parse(execSync(`curl -s -X ${m} -H 'Authorization: Bearer ${login.token}' -H 'Content-Type: application/json' ${body ? `-d '${JSON.stringify(body)}'` : ''} localhost:8099${path}`).toString() || '{}');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };

(async () => {
  q(`insert into platform_admins (user_id, role) values ('${login.user_id}', 'super_admin') on conflict do nothing`);
  const o = api('POST', '/v1/wallet/topups', { amount_inr: 777 });
  const pay = 'pay_ui_pay_' + Date.now();
  const sig = crypto.createHmac('sha256', process.env.E2E_RZP_SECRET || 'rzp-key-secret-for-tests').update(`${o.razorpay_order_id}|${pay}`).digest('hex');
  api('POST', '/v1/wallet/topups/verify', { razorpay_order_id: o.razorpay_order_id, razorpay_payment_id: pay, razorpay_signature: sig });

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 1000 } });
  await ctx.addCookies([{ name: 'autoshift_demo', value: '1', url: 'http://localhost:3111' }, { name: 'autoshift_admin', value: '1', url: 'http://localhost:3111' }]);
  const p = await ctx.newPage();
  await p.route('http://localhost:8099/**', (route) => route.continue({ headers: { ...route.request().headers(), authorization: `Bearer ${login.token}` } }));
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await p.goto('http://localhost:3111/admin/payments', { waitUntil: 'networkidle', timeout: 120000 });
  await p.waitForTimeout(2000);
  const text = await p.locator('main').innerText();
  ok(/₹777/.test(text) && /₹91[67]/.test(text), 'the new top-up shows with its amount and total incl. GST');
  ok(!/Smile Dental|Glow Beauty/.test(text), 'no sample payments or businesses are shown');
  await p.getByText('₹777', { exact: true }).first().click();
  await p.waitForTimeout(800);
  await p.screenshot({ path: '/tmp/claude-0/pay-detail.png' });
  await p.getByRole('button', { name: /^Refund/ }).first().click();
  await p.locator('#refund-reason').selectOption({ label: 'Goodwill' }).catch(async () => { await p.locator('#refund-reason').click(); await p.getByRole('option', { name: 'Goodwill' }).click(); });
  await p.getByRole('dialog').getByRole('button', { name: /^Refund$/ }).click();
  await p.waitForTimeout(2000);
  ok(Number(q(`select count(*) from audit_log where action='payment.refund' and target='${pay}'`)) === 1, 'the refund was requested through Razorpay and audited');
  await b.close();
})();
