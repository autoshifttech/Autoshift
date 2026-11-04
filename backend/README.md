# AutoShift API (FastAPI)

The backend that sits beside the Next.js app. Supabase stays the database and
login system; this service holds the business logic, the MCP server and the API the n8n nodes use.

## Run

```bash
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # fill it in
uvicorn app.main:app --reload --port 8000
pytest                      # no database needed
```

Apply every migration in `supabase/migrations` (061 to 072 are the backend's) to your Supabase project first,
then add yourself as the first platform admin:

```sql
INSERT INTO platform_admins (user_id, role) VALUES ('<your auth.users id>', 'super_admin');
```

## How requests are checked

1. **Login.** Every `/v1` route needs a Supabase access token (`Authorization: Bearer ...`).
   It is verified with the project's JWT secret (legacy) or public JWKS (newer).
2. **Workspace and role.** The caller's account and role come from their `profiles`
   row (`account_id`, `account_role`), looked up with the service key.
   Roles rank `viewer < agent < admin < owner`; routes ask for a minimum.
3. **Two layers of tenant isolation.** Account data is read and written with the
   *user's own token*, so Supabase row-level security applies, and every query
   also filters by `account_id` in code. Either layer alone keeps businesses apart.
4. **Platform staff** are rows in `platform_admins` (service role only), with roles
   `super_admin`, `finance`, `support`, `read_only`.
5. **Secrets** (provider API keys, Razorpay and Google keys) are encrypted with
   AES-256-GCM (`ENCRYPTION_KEY`), stored in tables no user can read, and never
   returned. Only the last four characters of an AI key are ever shown.
6. **Audit.** Every change writes to `audit_log`; platform entries are for staff,
   account entries are readable by that account's admins.

## Routes (foundation)

| Route | Who |
|---|---|
| `GET /health` | anyone |
| `GET /v1/me` | any signed-in member |
| `GET/POST /v1/assistants`, `GET/PATCH/DELETE /v1/assistants/{id}` | read: member; write: admin+ |
| `GET/POST /v1/connections`, `DELETE /v1/connections/{id}` | read: member; write: admin+ |
| `GET /v1/ai-models/available` | any member (no keys) |
| `GET /v1/platform/ai-models` | platform staff |
| `PUT /v1/platform/ai-providers/{vendor}` (key, on/off) | super_admin, finance |
| `POST/PATCH /v1/platform/ai-providers/{vendor}/models[/{id}]` | super_admin, finance |
| `GET /v1/platform/audit` | platform staff |

## Wallet and plans (Razorpay)

Migration `062_wallet_and_plans.sql`. Money is integer paise everywhere.

- **Ledger.** `wallet_ledger` is append-only (a trigger blocks edits and deletes).
  `wallet_apply()` is the only way money moves: it locks the balance, refuses to
  go below zero, and ignores a repeated `idem_key`, so retries never double-credit
  or double-charge.
- **Top-up.** `POST /v1/wallet/topups` creates a Razorpay order for credits plus 18% GST
  (the server decides the amount). Credits are added after the payment is confirmed,
  either by `POST /v1/wallet/topups/verify` (signature checked) or by the
  `order.paid` webhook. Both paths are safe together.
- **Webhooks.** `POST /v1/webhooks/razorpay` checks the signature over the raw body,
  records each event id, ignores repeats, and answers 500 on failure so Razorpay retries.
  Handled: `order.paid`, `subscription.activated|charged|halted|pending|cancelled|completed`, `refund.processed`.
- **Plans.** `GET /v1/plans`; a new workspace starts a 14-day trial. `POST /v1/subscription/checkout`
  creates the Razorpay plan/subscription (first charge waits until the trial ends),
  `/verify` checks the signature, `/cancel` stops renewal at the end of the paid period.
- **Invoices.** One GST invoice per payment, numbered `INV-YYYY-000001`.
- **Staff.** Finance can adjust a wallet (idempotent, audited) and refund a top-up; credits
  are taken back when Razorpay confirms the refund.
- **Charging.** `app/wallet.py::charge()` bills messages and AI replies at the rate card. WhatsApp
  messages are charged from Meta's own pricing on each message status (see *Web app bridge*), once per message id.

Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET`, and point the
Razorpay webhook at `/v1/webhooks/razorpay`.


## Everything else

| Area | Routes | Notes |
|---|---|---|
| Team | `GET /v1/team`, `PATCH/DELETE /v1/team/{user_id}`, `GET/POST/DELETE /v1/team/invitations` | Same rules as the app's database functions. Invite links (`SITE_URL/join/<token>`) store only a hash and count against plan seats. |
| AI tools | `GET/POST /v1/tools`, `PATCH/DELETE /v1/tools/{key}` | Built-ins per business (on/off only) and webhook tools (public https only). |
| Usage, billing details, invoices | `GET /v1/usage`, `GET/PUT /v1/billing-details`, `GET /v1/invoices` | GSTIN checked server-side; each invoice keeps a snapshot of the buyer and shows CGST/SGST or IGST. |
| AI runner | `POST /v1/assistants/{id}/test-reply` | Platform keys, model fallback, plan cap, wallet charge once, hand-off. |
| API keys and MCP | `GET/POST/DELETE /v1/mcp-keys`, `/v1/platform/mcp-keys`, MCP at `/mcp` | Keys are hashed; MCP tools call this same API with the caller's key. Money, delete and close tools need `confirm=true`; no tool takes a secret or grants admin access. |
| Outbound webhooks | `GET/POST/DELETE /v1/hooks`, `/ping`, `/deliveries` | Signed (HMAC-SHA256), retried with back-off, public https only. |
| Support and announcements | `/v1/support/tickets…`, `/v1/announcements`; staff: `/v1/platform/tickets…`, `/v1/platform/announcements…` | Staff notes never reach the business (filtered in code and by row-level security). |
| Platform | `/v1/platform/businesses…` (create, edit, suspend, plan/trial, notes, team, delete, close), `/payments`, `/payment-feed`, `/invoices`, `/usage`, `/overview`, `/admins`, `/audit`, `/wallets/{id}`, `/payments/{id}/refund` | Roles: super_admin (everything), support (businesses, support, announcements), finance (money). The last super admin can't be removed. |
| Closing a business | owner: `GET/POST/DELETE /v1/account/close-request` (30-day grace); staff: `POST /v1/platform/businesses/{id}/close` | Money records and the audit log are kept; everything else is deleted by `close_account_data()`; members get fresh workspaces; billing stops at once. |

## Web app bridge (`/v1/internal`)

The Next.js app still runs WhatsApp (sending, the inbox, flows). It talks to this service with a shared
secret (`INTERNAL_SECRET` here, `AUTOSHIFT_INTERNAL_SECRET` and `AUTOSHIFT_API_URL` there; never `NEXT_PUBLIC_`).

- `POST /v1/internal/charge` - the WhatsApp status webhook charges what Meta bills (`pricing.billable`,
  `pricing.category`), once per message id. A charge the wallet can't cover is refused and logged.
- `POST /v1/internal/can-send` - funds and suspension check before a send.
- `POST /v1/internal/ai-reply` - one live assistant reply (platform keys, plan cap, wallet, hand-off event).
- `POST /v1/internal/events` - events the app already emits (`message.received`, `conversation.created`,
  `message.status_updated` …) for this service's webhooks and the n8n trigger.

Without `INTERNAL_SECRET` these routes answer 503.

## Background worker

Runs inside the API process (`WEBHOOK_WORKER=true`, the default): every 30 seconds it retries due webhook
deliveries; about once an hour it closes businesses whose deletion grace period has ended.

## Tests

```bash
pytest                                     # fast, in-memory database
E2E_PG_DSN="host=… dbname=…" tests/e2e/setup_db.sh   # Supabase stub + every migration on a real Postgres
E2E_PG_DSN="host=… dbname=…" pytest tests/e2e         # the real app on that Postgres (real RLS, triggers, SQL)
```

`tests/e2e/ui-*.js` drive the real web app against the real API and database in a browser
(start `python -m tests.e2e.serve` and `NEXT_PUBLIC_API_URL=http://localhost:8099 npx next dev -p 3111` first).
Razorpay's checkout script is stubbed there with correctly signed payments; everything else is real.
