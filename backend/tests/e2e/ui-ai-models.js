// Admin AI models against the real API and database: the key is encrypted, never shown again, and gates what businesses see.
const { chromium } = require('playwright');
const fs = require('fs');
const { execSync } = require('child_process');
const login = JSON.parse(fs.readFileSync('/tmp/e2e-login.json', 'utf8'));
const DB = process.env.E2E_DB || 'fresh';
const q = (sql) => execSync(`psql "host=/tmp port=5544 user=postgres dbname=${DB}" -At -c "${sql}"`).toString().trim();
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const KEY = 'sk-live-ABCDEFGH-9876';

(async () => {
  q(`insert into platform_admins (user_id, role) values ('${login.user_id}', 'super_admin') on conflict do nothing`);
  q(`update platform_ai_providers set enabled=false, key_ciphertext=null, key_tail=null where vendor='openai'`);
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 1000 } });
  await ctx.addCookies([{ name: 'autoshift_demo', value: '1', url: 'http://localhost:3111' }, { name: 'autoshift_admin', value: '1', url: 'http://localhost:3111' }]);
  const p = await ctx.newPage();
  await p.route('http://localhost:8099/**', (route) => route.continue({ headers: { ...route.request().headers(), authorization: `Bearer ${login.token}` } }));
  const bodies = [];
  p.on('response', async (r) => { if (r.url().includes(':8099') && r.request().method() === 'GET') bodies.push(await r.text().catch(() => '')); });
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));

  await p.goto('http://localhost:3111/admin/ai-models', { waitUntil: 'networkidle', timeout: 120000 });
  await p.waitForTimeout(2000);
  let text = await p.locator('main').innerText();
  ok(/No key yet/.test(text), 'OpenAI starts with no key and is off');
  ok(/GPT-5\.4 Mini/.test(text), 'the model list comes from the server catalog');

  await p.locator('#prov-key').fill(KEY);
  await p.getByRole('button', { name: /^Save$/ }).click();
  await p.waitForTimeout(2000);
  const cipher = q(`select key_ciphertext from platform_ai_providers where vendor='openai'`);
  ok(cipher.startsWith('py1:') && !cipher.includes(KEY), 'the key is stored encrypted, not in plain text');
  ok(q(`select key_tail from platform_ai_providers where vendor='openai'`) === '9876', 'only the last four characters are kept for display');
  ok(/9876/.test(await p.locator('main').innerText()) && !(await p.locator('main').innerText()).includes(KEY), 'the page shows the last four, never the key');

  await p.getByRole('switch', { name: /Offer OpenAI/ }).click();
  await p.waitForTimeout(2000);
  ok(q(`select enabled from platform_ai_providers where vendor='openai'`) === 't', 'the provider was switched on');

  // default model change
  await p.getByRole('button', { name: /Make default: GPT-5\.5$/ }).click();
  await p.waitForTimeout(2000);
  ok(q(`select model_id from platform_ai_models where is_default`) === 'gpt-5.5', 'the platform default model changed (exactly one default)');
  ok(q(`select count(*) from platform_ai_models where is_default`) === '1', 'there is only ever one default');

  // switch a model off
  await p.getByText('GPT-4.1 Mini', { exact: true }).first().click();
  await p.waitForTimeout(2000);
  ok(q(`select enabled from platform_ai_models where model_id='gpt-4.1-mini' and vendor='openai'`) === 'f', 'a model was switched off');

  // add a custom model
  await p.getByPlaceholder(/Add a model by its name or id/).fill('gpt-custom-1');
  await p.getByRole('button', { name: /Add model/ }).click();
  await p.waitForTimeout(2000);
  ok(q(`select is_custom from platform_ai_models where model_id='gpt-custom-1'`) === 't', 'a custom model was added');
  ok(Number(q(`select count(*) from audit_log where scope='platform' and action like 'ai_%'`)) >= 4, 'each change is in the audit log');
  ok(!bodies.some((t) => t.includes(KEY) || t.includes('key_ciphertext')), 'the key and its ciphertext never come back from the API');

  // a business now sees only what is on
  await p.goto('http://localhost:3111/agents', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  const avail = await p.evaluate(async (tok) => (await fetch('http://localhost:8099/v1/ai-models/available', { headers: { Authorization: 'Bearer ' + tok } })).json(), login.token);
  ok(avail.length > 0 && avail.every((m) => m.vendor === 'openai') && !avail.some((m) => m.model_id === 'gpt-4.1-mini'), 'businesses are offered only the models that are on');
  await b.close();
})();
