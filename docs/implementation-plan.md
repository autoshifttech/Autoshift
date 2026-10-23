# Implementation plan

## Architecture
- **Browser:** React SPA.
  - Public site, plus `/app` for the CRM.
  - Supabase Auth issues the JWT the browser sends to the API.
- **FastAPI:**
  - Verifies Supabase JWTs, using the project JWKS or the legacy HS256 secret.
  - Scopes every call to a tenant through the `X-Tenant-Id` header plus a membership check.
  - Talks to the Meta Graph API.
  - Stores data in Supabase Postgres through asyncpg.
- **Meta → `POST /webhooks/whatsapp`:** the signature is verified, raw events are stored, a 200 goes back at once, and processing runs as a background task.

## Data (`supabase/migrations/20261023000000_init.sql`)
- `tenants` and `tenant_members` (roles: owner, admin, agent).
- `whatsapp_accounts`: one per tenant.
  - Unique `waba_id` and `phone_number_id`.
  - Step flags `webhooks_subscribed` and `phone_registered`, plus status, number details, `last_error`.
  - `token_ciphertext` and `pin_ciphertext`, Fernet-encrypted with `TOKEN_ENCRYPTION_KEY`.
- `webhook_events` (raw audit log), `messages` (unique `wamid`), `message_statuses` (unique `wamid` + status), `contact_requests`.
- RLS is enabled on every table. Members can read their tenant's rows, messages and statuses. Secret-bearing tables have no policies and are revoked from `anon` and `authenticated`.

## Embedded Signup flow
`frontend/src/features/whatsapp/embeddedSignup.ts` → `POST /api/whatsapp/embedded-signup` → `backend/app/services/onboarding.py`. The steps are:
1. Exchange the code.
2. Check the token with `debug_token`: right app, WABA in the granular scopes.
3. Check the phone number belongs to the WABA.
4. Store the account.
5. Subscribe the app to the WABA's webhooks.
6. Register the number (skipped for coexistence).
7. Fetch the number's status.

Failures after storage are saved as `subscribe_failed` or `registration_failed`, and `POST /account/retry` resumes from the failed step.

## Webhooks (`backend/app/services/webhooks.py`)
- `entry[].id` is the WABA ID, which identifies the tenant.
- `messages` events: inbound messages are de-duplicated by `wamid`, and statuses by `wamid` + status.
- `account_update` events:
  - `PARTNER_REMOVED` → disconnected, and the token is deleted.
  - Violation, restriction or disabled events → restricted.
- Unknown WABAs are logged and acknowledged.

## Remaining work
- Outbound messaging, templates, campaigns and the AI assistant. The marketing pages describe these, but they're not built.
- Replace the example prices and legal templates.
- A shared rate limiter (the current one is in-process) and a durable job queue for webhook processing at scale.
- A live end-to-end test against a real Meta app (see `meta-setup.md`).
