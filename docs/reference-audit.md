# Reference audit

The brief: study the public site at `https://www.sendiee.com/` and build an original, rebranded site (**Autoshift**) with a similar information architecture. No Sendiee code, copy, assets or branding is used.

## Tooling status
- **REA** (`rea-agents` 6.7.0) was installed with `npx rea-agents setup --client claude_code`.
- `claude mcp list` reports `rea: ✓ Connected`.
- A stdio MCP handshake returns 207 tools, including `capture_browser_scenario`, `inspect_web_page` and `compare_web_screenshots`.
- REA was later used to screenshot the Autoshift build (see `qa-report.md`).

## Limitation: the reference site could not be opened
- The build environment's network policy rejects `www.sendiee.com` (proxy CONNECT 403), so REA's browser tools could not load it.
- The web-fetch tool could not resolve any host from the environment.
- **No screenshots, DOM captures or measurements of the reference were taken.** The visual design here is original and is not a measured reproduction.
- To do a measured comparison, allow `sendiee.com` in the environment's network settings and run REA `capture_browser_scenario` against both sites at the same viewports.

## What indexed search results established (text only)
Sources: search-engine results for sendiee.com pages.
- **Pages:**
  - `/`, `/pricing`, `/tools`
  - `/tools/whatsapp-link-generator`, `/tools/whatsapp-qr-code-generator`, `/tools/whatsapp-text-formatter`
  - a chat-button tool (URL unknown)
  - `/contact`, `/release-notes`, `/terms`
  - developer docs on a `docs.` subdomain
- **Home topics:**
  - AI chatbots, bulk campaigns and lead segmentation on WhatsApp, Instagram and Messenger
  - AI conversations as opposed to flow-based bots
  - voice-note and image understanding, product recommendations, actions
  - lead categories (Interested / Converted / Cold) and extracted fields (city, language, budget, intent)
  - broadcasts, drips, scheduling, resend to undelivered contacts, delivery/read/reply analytics
  - AI voice calls, Instagram comment-to-DM, coexistence with the WhatsApp Business app
  - integrations (Shopify, WooCommerce, Zoho, an AI-calling provider, webhooks, REST API), shared inbox
- **Pricing:**
  - plans: Free, Growth, Pro, Business, Creator (Instagram/Messenger only) and Enterprise
  - billing periods: yearly, half-yearly, quarterly, monthly; prices in INR or USD
  - pay-per-use AI from a prepaid wallet, Meta template fees passed through at 0% markup, GST
- **Tools:** run in the browser with no sign-up. The QR tool supports a logo, colours, and PNG/SVG download.
- **Contact:** separate sales, support and partnerships contacts.
- **Not established:** fonts, colours, spacing, animations, dropdown contents, whether an FAQ, testimonials or a cookie banner exist.

## Decisions taken in the rebuild
- **Same page set and section topics**, with original copy and an original visual system (`design-system.md`).
- **Example content** in `frontend/src/content/pricing.ts`: prices, plan limits and features. Replace with Autoshift's real values.
- **No claims carried over:** no testimonials, customer logos, partner badges, offices or statistics.
- **Own release notes:** they describe this project's actual changes.
- **Legal pages are templates** that need review by counsel.
