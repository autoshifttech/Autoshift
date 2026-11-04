# WhatsApp Embedded Signup

Businesses connect their WhatsApp number from AutoShift through Meta's own popup. No ids or tokens to copy.

## How it works

1. **Browser** (`src/lib/whatsapp/fb-embedded-signup.ts`): loads Facebook's JavaScript SDK and calls `FB.login`
   with our Embedded Signup configuration. Meta returns a one-time `code` to the callback and, in a message from
   facebook.com, the WhatsApp Business Account (WABA) and phone-number ids the business picked.
2. **Server** (`POST /api/whatsapp/embedded-signup`, logic in `src/lib/whatsapp/embedded-signup.ts`):
   - swaps the code for the business's token (needs `META_APP_SECRET`, so only on the server),
   - checks the number is in that WABA and not connected to another AutoShift business,
   - subscribes the WABA to our app so its messages reach `/api/whatsapp/webhook`,
   - registers the number for the Cloud API with a generated two-step PIN,
   - saves the connection in `whatsapp_config` (token and PIN encrypted; `onboarded_via = 'embedded_signup'`).
3. The webhook accepts one platform verify token (`META_WEBHOOK_VERIFY_TOKEN`) for every business.

If `META_SYSTEM_USER_TOKEN` is set, it is used for every connected number instead of the business's own token
(which expires after 60 days with the template configuration). Signing up shares the business's WABA with
AutoShift's business portfolio, which is what lets AutoShift's system user act on it.

## Meta setup (done / to do)

| Step | Where | Status |
|---|---|---|
| App "Autoshift" (App ID 1871465417362221) | developers.facebook.com | done |
| WhatsApp use case, Facebook Login for Business | App dashboard | done |
| Embedded Signup configuration 1126755356785024 (template, 60-day token) | Facebook Login for Business → Configurations | done |
| JavaScript SDK domains and redirect URIs for autoshift.tech | Facebook Login for Business → Settings | done |
| Reset the app secret; save it only as `META_APP_SECRET` in hosting | App settings → Basic | to do |
| Basic settings: domains, privacy / terms / data-deletion URLs, icon, category | App settings → Basic | to do |
| Webhook: callback `https://www.autoshift.tech/api/whatsapp/webhook`, verify token = `META_WEBHOOK_VERIFY_TOKEN`; fields `messages`, `message_template_status_update`, `phone_number_quality_update`, `account_update` | WhatsApp → Configuration | to do (after deploy) |
| System user with WhatsApp permissions, permanent token → `META_SYSTEM_USER_TOKEN` | business.facebook.com → Settings → System users | to do |
| Test with app roles (admins / testers) in Development mode | App roles | to do |
| Business verification | business.facebook.com → Security centre | needs documents |
| Tech Provider, then App Review (Advanced Access for `whatsapp_business_management`, `whatsapp_business_messaging`) | App dashboard | after verification |
| Solution Partner and credit line (then set the admin switch to "AutoShift pays Meta") | Meta Business Partners | later |

## Who pays Meta

Admin → Wallet & costs → *WhatsApp message fees*. Default: **each business pays Meta** (the wallet charges only
AI replies). Switch to **AutoShift pays Meta** only once Meta approves AutoShift's credit line as a Solution Partner;
then the wallet recovers each message fee (charged once per message from Meta's own pricing on the status webhook).
