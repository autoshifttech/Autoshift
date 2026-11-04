# AutoShift API (FastAPI)

The backend that sits beside the Next.js app. Supabase stays the database and
login system; this service holds the business logic and, next, the MCP server.

## Run

```bash
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # fill it in
uvicorn app.main:app --reload --port 8000
pytest                      # no database needed
```

Apply `supabase/migrations/061_backend_foundation.sql` to your Supabase project first.

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

## Next

Razorpay wallet and plans, the WhatsApp core, the AI runner and queue, the MCP server
(user keys and admin keys), then the n8n nodes. Razorpay is the only payment provider;
the `flow_connections` table accepts `google` and `razorpay` only.

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
- **Charging.** `app/wallet.py::charge()` bills messages and AI replies at the rate card; the
  WhatsApp and AI runner phases call it.

Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET`, and point the
Razorpay webhook at `/v1/webhooks/razorpay`.
