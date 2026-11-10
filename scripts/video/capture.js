#!/usr/bin/env node
// Captures clean, high-resolution visual assets of AutoShift for the launch video.
// Usage (see scripts/video/README.md):
//   node scripts/video/capture.js [--base http://localhost:3111] [--out video-assets] [--only website,product,admin,brand]
//
// Desktop shots are 1920x1080 at 2x (3840x2160); phone shots are 430x932 at 3x (1290x2796).
// Product screens use demo sample data (scripts/video/seed-demo.js); nothing real is shown.

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { applySeed } = require('./seed-demo');

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = arg('base', 'http://localhost:3111');
const OUT = path.resolve(arg('out', 'video-assets'));
const ONLY = new Set(arg('only', 'website,product,admin,brand').split(','));

const DESKTOP = { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 };
const PHONE = { viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

// Hides things that do not belong in a launch video (trial countdown, help bubble, dev overlays, carets).
const CLEAN_CSS = `
  section[aria-label$="days left"], section[aria-label$="day left"], section[aria-label="Ends today"] { display: none !important; }
  button[aria-label="Open help"] { display: none !important; }
  nextjs-portal { display: none !important; }
  .ax-dot, .ax-ring, .ax-pill { display: none !important; }
  *, *::before, *::after { caret-color: transparent !important; }
`;

const log = (...m) => console.log(...m);
const mk = (...p) => { const d = path.join(OUT, ...p); fs.mkdirSync(d, { recursive: true }); return d; };

async function settle(p, ms = 1800) {
  await p.waitForLoadState('networkidle').catch(() => {});
  await p.addStyleTag({ content: CLEAN_CSS }).catch(() => {});
  await p.waitForTimeout(ms);
}

async function withContext(opts, seed, fn) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(opts);
  const seeded = seed ? await applySeed(ctx, { baseUrl: BASE, ...seed }) : null;
  try { await fn(ctx, await ctx.newPage()); } finally {
    if (seeded && seeded.patched() === 0) log('WARN seed did not apply: demo data was not found in the app scripts');
    await browser.close();
  }
}

/* ---------------------------------------------------------------- website */

// The public site at "/" (public/site/index.html). Section ids come from its ANCHOR map.
const SITE_SECTIONS = [
  ['01', 'hero', 'section.hero'],
  ['02', 'trust-strip', '#s-strip'],
  ['03', 'offer', '#s-offer'],
  ['05', 'numbers', '#s-numbers'],
  ['06', 'industries', '#s-industries'],
  ['07', 'projects', '#s-projects'],
  ['08', 'work', '#s-work'],
  ['09', 'process', '#s-process'],
  ['10', 'pricing', '#s-pricing'],
  ['11', 'insights', '#s-insights'],
  ['12', 'faq', '#s-faq'],
  ['13', 'get-started', '#s-start'],
];

async function website(device, opts) {
  await withContext(opts, null, async (_ctx, p) => {
    const dir = mk('01-website', device);
    await p.goto(BASE + '/', { waitUntil: 'networkidle' });
    await p.waitForTimeout(4000);
    await p.addStyleTag({ content: CLEAN_CSS });
    await p.screenshot({ path: path.join(dir, '00-hero-first-screen.png') });

    // Scroll through once so every section's entrance animation has played.
    const height = await p.evaluate(() => document.documentElement.scrollHeight);
    const vh = opts.viewport.height;
    const screens = mk('01-website', device, 'screens');
    for (let i = 0, y = 0; y < height && i < 40; i++, y += vh) {
      await p.evaluate((yy) => window.scrollTo(0, yy), y);
      await p.waitForTimeout(1200);
      await p.screenshot({ path: path.join(screens, `screen-${String(i + 1).padStart(2, '0')}.png`) });
    }
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.waitForTimeout(800);

    const sections = mk('01-website', device, 'sections');
    for (const [n, name, sel] of SITE_SECTIONS) {
      const el = p.locator(sel).first();
      if (!(await el.count())) { log('skip website', device, name, '(not on page)'); continue; }
      try {
        await el.scrollIntoViewIfNeeded();
        await p.waitForTimeout(900);
        await el.screenshot({ path: path.join(sections, `${n}-${name}.png`) });
      } catch (e) { log('FAIL website', device, name, e.message.split('\n')[0]); }
    }
    // Services is a pinned, scroll-driven carousel of seven cards: one frame per card.
    const svc = await p.evaluate(() => {
      const el = document.querySelector('#s-services');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top + window.scrollY, height: el.offsetHeight };
    });
    if (svc) {
      const cards = 7;
      const travel = Math.max(0, svc.height - vh);
      for (let i = 0; i < cards; i++) {
        await p.evaluate((yy) => window.scrollTo(0, yy), Math.round(svc.top + (travel * i) / (cards - 1)));
        await p.waitForTimeout(1300);
        await p.screenshot({ path: path.join(sections, `04-services-card-${i + 1}.png`) });
      }
    }
    await p.screenshot({ path: path.join(dir, 'full-page.png'), fullPage: true });
    log('ok website', device);
  });
}

/* ---------------------------------------------------------------- product */

const openChat = async (p) => { await p.getByText('Sara Thomas').first().click(); };
const hideAuthNotice = async (p) => {
  // Local captures have no Supabase keys, so login/signup show a setup notice for developers; hide it.
  await p.evaluate(() => {
    const re = /Sign-in isn.t connected yet/;
    const hits = [...document.querySelectorAll('body *')].filter((n) => re.test(n.textContent || ''));
    // The innermost matches (the notice is rendered twice: phone and desktop layouts).
    const leaves = hits.filter((n) => !hits.some((m) => m !== n && n.contains(m)));
    for (const el of leaves) {
      let box = el;
      while (box.parentElement && getComputedStyle(box).backgroundColor === 'rgba(0, 0, 0, 0)') box = box.parentElement;
      if (box !== document.body) box.style.display = 'none';
    }
  });
};
const flowFromTemplate = async (p) => {
  await p.getByRole('button', { name: /new flow/i }).first().click();
  await p.waitForTimeout(800);
  await p.getByRole('dialog').getByRole('button', { name: /lead capture/i }).click();
  await p.waitForURL(/\/flows\/[^/]+$/, { timeout: 60000 });
};
const automationWithSteps = async (p) => {
  for (const step of [/send message/i, /wait/i, /send template/i]) {
    await p.getByRole('button', { name: /add step/i }).last().click();
    await p.getByRole('menuitem', { name: step }).click();
    await p.waitForTimeout(300);
  }
};

const PRODUCT_DESKTOP = [
  ['01-login', '/login', hideAuthNotice],
  ['02-signup', '/signup', hideAuthNotice],
  ['03-onboarding', '/onboarding'],
  ['04-dashboard', '/dashboard'],
  ['05-inbox', '/inbox'],
  ['06-inbox-chat-ai-reply', '/inbox', openChat],
  ['07-contacts', '/contacts'],
  ['08-leads', '/leads'],
  ['09-segments', '/segments'],
  ['10-ai-assistants', '/agents'],
  ['11-lead-capture', '/agents?tab=leads'],
  ['12-business-presets', '/agents?tab=presets'],
  ['13-ai-playground', '/agents?tab=playground'],
  ['14-ai-tools', '/ai-tools'],
  ['15-broadcasts', '/broadcasts'],
  ['16-broadcast-new', '/broadcasts/new'],
  ['17-templates', '/templates'],
  ['18-automations', '/automations'],
  ['19-automation-builder', '/automations/new', automationWithSteps],
  ['20-flows', '/flows'],
  ['21-flow-canvas', '/flows', flowFromTemplate],
  ['22-drips', '/drips'],
  ['23-insights', '/insights'],
  ['24-wallet', '/wallet'],
  ['25-settings-whatsapp', '/settings?tab=whatsapp'],
  ['26-tool-link-generator', '/tools/whatsapp-link-generator'],
  ['27-tool-qr-code', '/tools/whatsapp-qr-code-generator'],
];
const PRODUCT_PHONE = [
  ['01-dashboard', '/dashboard'],
  ['02-inbox', '/inbox'],
  ['03-inbox-chat-fullscreen', '/inbox', openChat],
  ['04-contacts', '/contacts'],
  ['05-leads', '/leads'],
  ['06-ai-assistants', '/agents'],
  ['07-broadcasts', '/broadcasts'],
  ['08-flow-editor', '/flows', flowFromTemplate],
  ['09-insights', '/insights'],
];
const DARK_DESKTOP = ['04-dashboard', '06-inbox-chat-ai-reply', '10-ai-assistants', '23-insights'];
const DARK_PHONE = ['01-dashboard', '03-inbox-chat-fullscreen'];

async function productSet(folder, opts, mode, list) {
  await withContext(opts, { mode }, async (_ctx, p) => {
    const dir = mk('02-product', folder);
    for (const [name, url, act] of list) {
      try {
        await p.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await settle(p);
        if (act) { await act(p); await settle(p, 1200); }
        await p.mouse.move(2, opts.viewport.height - 2);
        await p.screenshot({ path: path.join(dir, name + '.png') });
      } catch (e) { log('FAIL product', folder, name, e.message.split('\n')[0]); }
    }
    log('ok product', folder);
  });
}

/* ---------------------------------------------------------------- admin */

const ADMIN = [
  ['01-overview', '/admin'],
  ['02-businesses', '/admin/businesses'],
  ['03-payments', '/admin/payments'],
  ['04-wallet-costs', '/admin/wallet'],
  ['05-whatsapp-health', '/admin/whatsapp'],
  ['06-ai-usage', '/admin/ai'],
  ['07-support', '/admin/support'],
];

async function admin() {
  await withContext(DESKTOP, null, async (_ctx, p) => {
    const dir = mk('03-admin');
    // The admin sign-in has a design preview: any email, an 8+ character password and any 6 digits.
    await p.goto(BASE + '/admin/login', { waitUntil: 'networkidle' });
    await p.getByLabel(/work email/i).fill('team@autoshift.tech');
    await p.getByLabel(/password/i).fill('preview-password');
    await p.getByRole('button', { name: /continue/i }).click();
    await p.getByLabel('Digit 1').click();
    await p.keyboard.type('123456', { delay: 60 });
    await p.waitForTimeout(1500);
    if (/\/admin\/login/.test(new URL(p.url()).pathname)) {
      const verify = p.getByRole('button', { name: /verify/i });
      if (await verify.count()) await verify.first().click();
    }
    await p.waitForURL((u) => !/\/admin\/login/.test(u.pathname), { timeout: 30000 });
    for (const [name, url] of ADMIN) {
      try {
        await p.goto(BASE + url, { waitUntil: 'domcontentloaded' });
        await settle(p, 2200);
        await p.mouse.move(2, 1078);
        await p.screenshot({ path: path.join(dir, name + '.png') });
      } catch (e) { log('FAIL admin', name, e.message.split('\n')[0]); }
    }
    log('ok admin');
  });
}

/* ---------------------------------------------------------------- brand */

const MARK = (bg, fg, rx = 14) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${bg ? `<rect width="64" height="64" rx="${rx}" fill="${bg}"/>` : ''}` +
  `<path d="M18 36l14-14 14 14M18 50l14-14 14 14" fill="none" stroke="${fg}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>\n`;

const WORDMARK_HTML = (markBg, markFg, text, pageBg) => `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@700;800&display=swap" rel="stylesheet">
<style>html,body{margin:0;background:${pageBg}}#w{display:inline-flex;align-items:center;gap:28px;padding:40px 56px;
font:800 120px/1 "Plus Jakarta Sans",sans-serif;letter-spacing:-.03em;color:${text}}#w svg{width:150px;height:150px}</style></head>
<body><div id="w">${MARK(markBg, markFg)}AutoShift</div></body></html>`;

async function brand() {
  const dir = mk('04-brand');
  const logos = mk('04-brand', 'logo');
  fs.writeFileSync(path.join(logos, 'mark-green.svg'), MARK('#1E4C41', '#FFFFFF'));
  fs.writeFileSync(path.join(logos, 'mark-white.svg'), MARK('#FFFFFF', '#1E4C41'));
  fs.writeFileSync(path.join(logos, 'chevrons-green.svg'), MARK(null, '#1E4C41'));
  fs.writeFileSync(path.join(logos, 'chevrons-white.svg'), MARK(null, '#FFFFFF'));

  await withContext({ viewport: { width: 1400, height: 400 }, deviceScaleFactor: 2 }, null, async (_ctx, p) => {
    const variants = [
      ['wordmark-on-light', '#1E4C41', '#FFFFFF', '#1B2420', 'transparent'],
      ['wordmark-on-dark', '#FFFFFF', '#1E4C41', '#FFFFFF', 'transparent'],
    ];
    for (const [name, mb, mf, text, bg] of variants) {
      await p.setContent(WORDMARK_HTML(mb, mf, text, bg), { waitUntil: 'networkidle' });
      await p.evaluate(() => document.fonts.ready);
      await p.locator('#w').screenshot({ path: path.join(logos, name + '.png'), omitBackground: true });
    }
    for (const [name, bg, fg] of [['mark-green', '#1E4C41', '#FFFFFF'], ['mark-white', '#FFFFFF', '#1E4C41']]) {
      await p.setContent(`<html><body style="margin:0;background:transparent"><div id="m" style="width:1024px;height:1024px">${MARK(bg, fg)}</div></body></html>`);
      await p.setViewportSize({ width: 1024, height: 1024 });
      await p.locator('#m').screenshot({ path: path.join(logos, name + '-1024.png'), omitBackground: true });
    }
  });

  // Shifty, the mascot: each mood as a transparent PNG (static pose) plus the live HTML preview.
  const shiftyDir = mk('04-brand', 'shifty');
  fs.copyFileSync(path.join(__dirname, 'shifty-mascot.html'), path.join(shiftyDir, 'shifty-preview.html'));
  await withContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' }, null, async (_ctx, p) => {
    await p.goto('file://' + path.join(__dirname, 'shifty-mascot.html'));
    await p.waitForTimeout(800);
    // Transparent background so the PNGs sit on any colour.
    await p.addStyleTag({ content: 'html,body,.stage,.card{background:transparent!important;box-shadow:none!important;border-color:transparent!important}' });
    for (const mode of ['light', 'dark']) {
      await p.evaluate((m) => document.documentElement.setAttribute('data-theme', m), mode);
      for (const mood of ['Idle', 'Thinking', 'Happy', 'Sleeping', 'Oops']) {
        await p.getByRole('button', { name: mood, exact: true }).click();
        await p.waitForTimeout(250);
        const svg = p.locator('#heroSlot svg');
        await svg.screenshot({ path: path.join(shiftyDir, `shifty-${mood.toLowerCase()}-${mode}.png`), omitBackground: true });
      }
    }
  });

  fs.writeFileSync(path.join(dir, 'brand.md'), `# AutoShift brand

| Token | Value | Use |
|---|---|---|
| Primary green | #1E4C41 | Logo, buttons, key surfaces |
| Cream background | #FAF8F4 | Page background (light) |
| Card | #FFFDF9 | Cards (light) |
| Ink | #1B2420 | Text |
| Mint accent | #7CC9B0 | Highlights, Shifty's tuft |
| Coral accent | #F08C74 | Small accents, Shifty's cheeks |
| Dark background | #111614 | Page background (dark) |

Font: Plus Jakarta Sans (Google Fonts), weights 400–800. Headlines 700–800 with slightly tight letter spacing.
Logo: the double chevron on a rounded green square (logo/mark-*.svg). Keep clear space of at least half the mark's width.
Mascot: Shifty (shifty/), a green chat bubble. Use at key moments only.
`);
  log('ok brand');
}

/* ---------------------------------------------------------------- run */

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  if (ONLY.has('website')) { await website('desktop', DESKTOP); await website('phone', PHONE); }
  if (ONLY.has('product')) {
    await productSet('desktop-light', DESKTOP, 'light', PRODUCT_DESKTOP);
    await productSet('phone-light', PHONE, 'light', PRODUCT_PHONE);
    await productSet('desktop-dark', DESKTOP, 'dark', PRODUCT_DESKTOP.filter(([n]) => DARK_DESKTOP.includes(n)));
    await productSet('phone-dark', PHONE, 'dark', PRODUCT_PHONE.filter(([n]) => DARK_PHONE.includes(n)));
  }
  if (ONLY.has('admin')) await admin();
  if (ONLY.has('brand')) await brand();
  log('done ->', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
