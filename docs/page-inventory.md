# Page inventory

| Route | Purpose | Sections / components | Interactions | Status |
|---|---|---|---|---|
| `/` | Product overview | Hero with animated chat · channel cards · AI vs flow bots · AI chatbot tabs · lead segmentation board · campaigns + report · shared inbox mock · AI calls & comment-to-DM · integrations · pricing band · tools teaser · final CTA | Scroll reveals, capability tabs, looping chat demo, anchor links from the Product menu | Built |
| `/pricing` | Plans | Plan-family toggle, billing period, currency, plan cards, limits table, billing-details accordion | Toggles recalculate prices; accordion; table scrolls horizontally on small screens | Built (example prices) |
| `/tools` | Tool index | 4 tool cards | Links | Built |
| `/tools/whatsapp-link-generator` | wa.me link builder | Country, number, message, link output, chat preview, QR | Validation, copy, open link in new tab, QR download | Built |
| `/tools/whatsapp-qr-code-generator` | Branded QR | Number, message, colours, logo upload, preview | PNG (1024px) and SVG download, logo checks (type, 1 MB) | Built |
| `/tools/whatsapp-text-formatter` | WhatsApp formatting | Toolbar, editor, WhatsApp-style preview | Wrap selection, list/quote prefixes, copy | Built |
| `/tools/whatsapp-chat-button` | Website widget | Number, label, greeting, colour, position, embed code, live preview | Copy snippet, preview button opens wa.me | Built |
| `/contact` | Enquiries | Topic picker (sales/support/partnerships), validated form | Posts to `POST /api/contact` (stored in Supabase); success only after the API accepts it | Built |
| `/release-notes` | Changelog | Timeline from `content/releases.ts` | Category filter | Built |
| `/terms`, `/privacy` | Legal | Table of contents + sections | Anchor links | Built (template text) |
| `/login` | Auth | Sign in / sign up, magic link | Supabase Auth | Built |
| `/app` | CRM inbox | Workspace bootstrap, message list | Refresh | Built |
| `/app/settings/whatsapp` | WhatsApp connection | Connect card (Embedded Signup), connected-number card | Connect, refresh, retry failed step, disconnect | Built |
| `*` | 404 | Message + links | — | Built |
