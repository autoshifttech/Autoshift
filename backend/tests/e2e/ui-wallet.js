// Top-up through the real UI, API and database. Razorpay's script is replaced by a stub that
// answers with a correctly signed payment (the real one needs your keys).
//   see ui-assistants.js for how to start the servers
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
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([{ name: 'autoshift_demo', value: '1', url: 'http://localhost:3111' }]);
  const p = await ctx.newPage();
  await p.route('http://localhost:8099/**', (route) => route.continue({ headers: { ...route.request().headers(), authorization: `Bearer ${login.token}` } }));
  await p.exposeFunction('signPayment', (orderId, paymentId) => crypto.createHmac('sha256', SECRET).update(`${orderId}|${paymentId}`).digest('hex'));
  await p.addInitScript(() => {
    window.Razorpay = function (opts) {
      this.opts = opts;
      this.on = () => {};
      this.open = async () => {
        window.__rzpOrder = { order_id: opts.order_id, amount: opts.amount, key: opts.key };
        const pay = 'pay_ui_' + Math.random().toString(36).slice(2, 10);
        opts.handler({ razorpay_order_id: opts.order_id, razorpay_payment_id: pay, razorpay_signature: await window.signPayment(opts.order_id, pay) });
      };
    };
  });
  const calls = [];
  p.on('request', (r) => r.url().startsWith('http://localhost:8099') && r.method() !== 'OPTIONS' && calls.push(`${r.method()} ${new URL(r.url()).pathname}`));
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));

  await p.goto('http://localhost:3111/wallet', { waitUntil: 'networkidle', timeout: 120000 });
  await p.waitForTimeout(1500);
  let body = await p.locator('main').innerText();
  ok(!/Festive sale|Restock alert/.test(body), 'the sample transactions are not shown');
  ok(/₹0\.00/.test(body), 'a new business starts at ₹0.00');

  await p.getByRole('button', { name: /top up|add credits/i }).first().click();
  await p.getByRole('button', { name: /^₹1,000$/ }).click();
  ok(!(await p.getByText(/pay with/i).count()), 'the fake payment-method picker is hidden (Razorpay offers the methods)');
  await p.getByRole('button', { name: /^Pay ₹1,180\.00/ }).click();
  await p.waitForTimeout(2500);

  const order = await p.evaluate(() => window.__rzpOrder);
  ok(order && order.amount === 118000 && /^rzp_test_/.test(order.key), `Checkout opened with the server's order and amount (${order && order.amount} paise incl. GST)`);
  ok(q(`select balance_paise from wallet_balances where account_id=${acct}`) === '100000', 'the real wallet was credited ₹1,000 (GST not credited)');
  ok(q(`select count(*) from invoices where account_id=${acct}`) === '1', 'a GST invoice was issued');
  ok(q(`select status from payment_orders where account_id=${acct}`) === 'paid', 'the order is marked paid');
  body = await p.locator('main').innerText();
  ok(/₹1,000\.00/.test(body), 'the screen shows the new balance');

  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  ok(/₹1,000\.00/.test(await p.locator('main').innerText()), 'after a reload the balance comes from the server');
  console.log('API calls:', calls.join(' , '));
  await b.close();
})();
