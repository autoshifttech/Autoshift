// Plan checkout through the real UI, API and database (Razorpay's script stubbed with a signed payment).
const { chromium } = require('playwright');
const crypto = require('crypto');
const fs = require('fs');
const { execSync } = require('child_process');
const login = JSON.parse(fs.readFileSync('/tmp/e2e-login.json', 'utf8'));
const DB = process.env.E2E_DB || 'fresh';
const SECRET = process.env.E2E_RZP_SECRET || 'rzp-key-secret-for-tests';
const q = (sql) => execSync(`psql "host=/tmp port=5544 user=postgres dbname=${DB}" -At -c "${sql}"`).toString().trim();
const acct = `(select account_id from profiles where user_id='${login.user_id}')`;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
  await ctx.addCookies([{ name: 'autoshift_demo', value: '1', url: 'http://localhost:3111' }]);
  const p = await ctx.newPage();
  await p.route('http://localhost:8099/**', (route) => route.continue({ headers: { ...route.request().headers(), authorization: `Bearer ${login.token}` } }));
  await p.exposeFunction('signSub', (payId, subId) => crypto.createHmac('sha256', SECRET).update(`${payId}|${subId}`).digest('hex'));
  await p.addInitScript(() => {
    window.Razorpay = function (opts) {
      this.on = () => {};
      this.open = async () => {
        window.__rzp = { subscription_id: opts.subscription_id, key: opts.key };
        const pay = 'pay_sub_' + Math.random().toString(36).slice(2, 10);
        opts.handler({ razorpay_payment_id: pay, razorpay_subscription_id: opts.subscription_id, razorpay_signature: await window.signSub(pay, opts.subscription_id) });
      };
    };
  });
  const calls = [];
  p.on('request', (r) => r.url().startsWith('http://localhost:8099') && r.method() !== 'OPTIONS' && calls.push(`${r.method()} ${new URL(r.url()).pathname}`));
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));

  await p.goto('http://localhost:3111/settings?tab=billing', { waitUntil: 'networkidle', timeout: 120000 });
  await p.waitForTimeout(2000);
  let body = await p.locator('main').innerText();
  ok(/No invoices yet/.test(body), 'a new business has no invoices (sample invoices are gone)');
  ok(!/INV-2026-0091/.test(body), 'the sample invoice numbers are not shown');
  ok(q(`select status from subscriptions where account_id=${acct}`) === 'trialing', 'the trial subscription was created by the server');

  await p.getByRole('button', { name: /subscribe now/i }).click();
  await p.locator('#gst-legalName').fill('UI Test Traders');
  await p.getByText('Choose your state…').click();
  await p.getByRole('option', { name: 'Karnataka' }).click();
  await p.getByRole('button', { name: /^Pay ₹/ }).click();
  await p.waitForTimeout(3000);
  const rz = await p.evaluate(() => window.__rzp);
  ok(rz && /^sub_/.test(rz.subscription_id), `Checkout opened for the server's subscription (${rz && rz.subscription_id})`);
  ok(q(`select legal_name||'/'||state_code from billing_details where account_id=${acct}`) === 'UI Test Traders/29', 'GST details were saved on the server');
  ok(q(`select razorpay_subscription_id is not null from subscriptions where account_id=${acct}`) === 't', 'the subscription is linked to Razorpay');
  ok(q(`select count(*) from audit_log where account_id=${acct} and action='subscription.verify'`) === '1', 'the payment signature was verified and audited');
  await p.screenshot({ path: '/tmp/claude-0/billing-2.png' });

  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  body = await p.locator('main').innerText();
  ok(/Growth/i.test(body), 'after a reload the plan comes from the server');
  console.log('API calls:', [...new Set(calls)].join(' , '));
  await b.close();
})();
