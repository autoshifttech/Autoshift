# QA report — 2026-10-23

## Automated checks
| Check | Result |
|---|---|
| Backend `uv run pytest` | **22 passed**: signup happy path, ownership rejection, exchange failure, registration failure + retry, coexistence, 409 WABA conflict, roles/401/403, invalid JWT, disconnect, refresh, input validation, webhook verify/signature/matching/dedupe/statuses/unknown WABA/`PARTNER_REMOVED`/restriction, tenants, contact + honeypot |
| Backend `uv run ruff check .` / `ruff format --check .` | Clean |
| Frontend `npm run lint` (ESLint + react-hooks) | Clean (0 errors, 0 warnings) |
| Frontend `tsc -b` | Clean |
| Frontend `npm test` (Vitest) | **10 passed**: Embedded Signup message parsing/origin checks, wa.me building, number validation, formatter |
| Frontend `vite build` | Succeeds. A single ~650 kB JS chunk; route-level code splitting is a follow-up |

## Responsive check
- Production build, headless Chromium, 13 routes × widths **360, 390, 768, 1024, 1440**.
- Checked `scrollWidth > clientWidth`, plus console errors and page errors.
- **Fixed:** the chat-button tool overflowed at 360/390px because the embed `<pre>` widened its grid column. Adding `min-w-0` fixed it.
- **Final run:** no overflow and no console or page errors.

## Interaction run (Playwright, 18/18 pass)
- **Navigation:** mobile menu opens, closes on Escape, and closes on link navigation. The Product dropdown opens and its anchor link scrolls to `#campaigns` below the sticky header.
- **Pricing:** monthly USD Pro shows $39, INR shows ₹2,999, the Creator plans switch works, and the accordion expands.
- **Tools:** the link generator produces `https://wa.me/919876543210?text=…` and renders the QR. The text formatter wraps the selection in `*…*`.
- **Contact:** the `?topic=` preselect works, validation errors show, and a valid submit reaches the running API (memory backend) and shows "Message received".
- **CRM:** the browser sent an HS256 JWT that the running API verified. "Create workspace" called `POST /api/tenants`, and Settings → WhatsApp showed an enabled **Connect WhatsApp** button.
- **Connected state:** shown with a **mocked** `/api/whatsapp/account` response, because no Meta app is reachable from this environment.

## Screenshots
Taken with REA `capture_browser_scenario` (desktop) and Playwright (mobile, settings):
- `screenshots/autoshift-home.png`, `screenshots/autoshift-pricing.png`, `screenshots/autoshift-link-generator.png` (1440px)
- `screenshots/mobile-pricing.png` (390px)
- `screenshots/settings-connect.png`, `screenshots/settings-connected.png` (the connected one uses mocked data)

## Not tested / known limitations
- **No live Meta test.** `graph.facebook.com` and `connect.facebook.net` are blocked from the build environment. The Graph calls are covered only by mocked tests; do the live run described in `meta-setup.md`.
- **No live Supabase test.** `supabase.com` is blocked from the build environment. The Postgres repository and migration have not been run against a database; apply the migration and run the backend with `REPOSITORY_BACKEND=postgres` before launch.
- **Reference site not inspected** (see `reference-audit.md`), so there's no visual comparison with it.
- **Example content:** prices and plan limits are examples, and the legal pages are templates.
