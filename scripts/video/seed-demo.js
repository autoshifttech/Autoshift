// Demo-data seed for video captures.
//
// The app's demo mode ("View demo") runs on in-memory sample data that lives in the browser.
// This seed adjusts that sample data at capture time only, without touching product code:
//   - signs the browser into demo mode (cookie),
//   - shows the sample business with WhatsApp connected (the stock demo starts disconnected,
//     which puts a red "not connected" banner on most screens),
//   - picks light or dark mode.
// It does this by rewriting the demo-data object in the JavaScript the server sends to the
// browser, so the running app, the repository and real accounts are never changed.

const fs = require('fs');
const path = require('path');

const DEMO_COOKIE = 'autoshift_demo';
const DATA_FILE = path.join(__dirname, '..', '..', 'src', 'lib', 'demo', 'data.ts');

/** The sample account id, read from the demo data so the seed stays in sync with it. */
function demoAccountId() {
  const src = fs.readFileSync(DATA_FILE, 'utf8');
  const m = src.match(/DEMO_ACCOUNT_ID\s*=\s*'([^']+)'/);
  if (!m) throw new Error('seed-demo: DEMO_ACCOUNT_ID not found in src/lib/demo/data.ts');
  return m[1];
}

const PHONE = '+91 98765 43210';

/** Text swaps in the demo data, as it appears in the built JavaScript. Each must match once. */
const REPLACEMENTS = (accountId) => [
  // The account's WhatsApp setup row (inbox banner, settings).
  ['whatsapp_config:[]',
    `whatsapp_config:[{id:"demo-wa",account_id:"${accountId}",status:"connected",phone_number_id:"1000000000",display_phone_number:"${PHONE}"}]`],
  // The dashboard overview's setup checklist.
  ['setup:{whatsappConnected:!1', 'setup:{whatsappConnected:!0'],
  // The number's daily messaging limit, in the shape the real health endpoint returns.
  ['limit:"TIER_1K"', 'limit:{kind:"tier",perDay:1e3}'],
];

/**
 * Applies the seed to a Playwright browser context.
 * @param {import('playwright').BrowserContext} context
 * @param {{ baseUrl: string, mode?: 'light' | 'dark', demo?: boolean }} opts
 * @returns {Promise<{ patched: () => number }>} how many demo-data swaps were applied (0 means the seed did not apply)
 */
async function applySeed(context, { baseUrl, mode = 'light', demo = true }) {
  let patched = 0;
  if (demo) await context.addCookies([{ name: DEMO_COOKIE, value: '1', url: baseUrl }]);
  await context.addInitScript(({ m, phone }) => {
    try {
      localStorage.setItem('autoshift.mode', m);
      // The workspace setup checklist (dashboard "Channels" card) lives in localStorage.
      const raw = localStorage.getItem('autoshift.setup');
      const setup = raw ? JSON.parse(raw) : {
        step: 0,
        business: { name: '', industry: '', country: 'IN', timeZone: 'Asia/Kolkata', currency: 'INR', displayName: '', website: '' },
        features: ['ai_support', 'lead_capture'],
        completedAt: null,
      };
      setup.whatsapp = 'connected';
      setup.number = { displayPhoneNumber: phone, verifiedName: 'Olive & Thread', quality: 'GREEN', wabaId: '2000000000', phoneNumberId: '1000000000' };
      localStorage.setItem('autoshift.setup', JSON.stringify(setup));
    } catch { /* storage blocked */ }
  }, { m: mode, phone: PHONE });

  const swaps = REPLACEMENTS(demoAccountId());
  await context.route('**/_next/static/chunks/**/*.js', async (route) => {
    try {
      const res = await route.fetch();
      const body = await res.text();
      let out = body;
      for (const [from, to] of swaps) {
        if (out.includes(from)) { out = out.replace(from, to); patched += 1; }
      }
      return await route.fulfill({ response: res, body: out });
    } catch {
      // The page navigated away mid-request; let the browser carry on.
      await route.continue().catch(() => {});
    }
  });
  return { patched: () => patched };
}

module.exports = { applySeed, DEMO_COOKIE };
