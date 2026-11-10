# Video asset capture

Re-creates the launch-video asset pack (website sections, product screens, admin panel, logo and the
Shifty mascot) from the running app. Product screens use the demo sample data, never real accounts.

## Files

| File | What it does |
|---|---|
| `capture.js` | Opens the site in a headless browser and saves every shot |
| `seed-demo.js` | Adjusts the demo sample data at capture time only (WhatsApp shown as connected, light/dark mode). It rewrites the demo data in the browser's copy of the app's JavaScript, so product code and real data are untouched. |
| `shifty-mascot.html` | The Shifty mascot preview; `capture.js` renders each mood from it |

## Run it

```bash
# 1. Playwright (once). Not a project dependency, so it is not in package.json.
npm i --no-save playwright && npx playwright install chromium

# 2. A production build of the app (no dev overlay), on port 3111.
npm run build && npx next start -p 3111

# 3. In another terminal, from the repository root:
node scripts/video/capture.js --base http://localhost:3111 --out video-assets

# Only some parts:  --only website,product,admin,brand
```

The pack lands in `video-assets/` (git-ignored). Zip it with `cd video-assets && zip -r ../video-assets.zip .`.

## What gets captured

| Folder | Contents | Size |
|---|---|---|
| `01-website/desktop`, `01-website/phone` | Public site (`/`): first screen, each section on its own, one frame per Services card, scroll-by-scroll screens, full page | Desktop 3840×2160 (1920×1080 @2x), phone 1290×2796 (430×932 @3x) |
| `02-product/desktop-light`, `phone-light`, `desktop-dark`, `phone-dark` | The business app: dashboard, inbox and AI reply, contacts, leads, AI assistants, broadcasts, automations, flows, insights, wallet, settings, free tools | Same sizes |
| `03-admin` | AutoShift team panel (design preview data) | Desktop |
| `04-brand` | Logo (SVG + PNG), wordmark, brand colours and font, Shifty in five moods (transparent PNG, light and dark) | — |

Hidden for a clean look: the trial countdown, the help bubble, the site's custom cursor and the
local "Sign-in isn't connected" developer notice (it only appears without Supabase keys).

## When the UI changes

- New page: add a line to `PRODUCT_DESKTOP` / `PRODUCT_PHONE` / `ADMIN` in `capture.js`.
- New website section: add its id to `SITE_SECTIONS` (ids come from `ANCHOR` in `public/site/index.html`).
- If a run prints `WARN seed did not apply`, the demo data shape changed: update the search string in `seed-demo.js`.
