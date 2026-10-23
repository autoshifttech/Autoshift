# Autoshift

AI conversations, campaigns and a shared inbox for WhatsApp, Instagram and Messenger.

| Part | Stack | Path |
|---|---|---|
| Marketing site + CRM app | React 19, Vite, TypeScript, Tailwind CSS 4 | [`frontend/`](frontend) |
| API (Embedded Signup, webhooks, tenants) | FastAPI, Python 3.12+ | [`backend/`](backend) |
| Database & auth | Supabase (Postgres + Auth) | [`supabase/migrations/`](supabase/migrations) |

## Quick start

```bash
# 1. Database: run supabase/migrations/*.sql in the Supabase SQL editor (or `supabase db push`).

# 2. Backend
cd backend
cp .env.example .env          # fill in Meta, Supabase and encryption values
uv sync                       # or: pip install -e . && pip install pytest pytest-asyncio respx ruff
uv run uvicorn app.main:create_app --factory --reload --port 8000

# 3. Frontend
cd ../frontend
cp .env.example .env.local    # public values only
npm install
npm run dev                   # http://localhost:5173
```

Checks: `uv run pytest`, `uv run ruff check .` (backend) · `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` (frontend).

## WhatsApp Embedded Signup

Settings → WhatsApp has a **Connect WhatsApp** button. It loads the Meta JS SDK, runs
`FB.login` with your Embedded Signup `config_id`, and listens for the `WA_EMBEDDED_SIGNUP`
message event carrying the WABA ID and phone number ID. The browser posts the code and IDs to
`POST /api/whatsapp/embedded-signup`, where the API:

1. exchanges the code for a business token,
2. checks with `debug_token` that the token was issued to this app and grants that WABA,
3. checks the phone number belongs to the WABA,
4. stores `waba_id`, `phone_number_id` and the **encrypted** token for the tenant,
5. subscribes the app to the WABA's webhooks (`POST /{waba_id}/subscribed_apps`),
6. registers the number (`POST /{phone_number_id}/register`, skipped for coexistence numbers),
7. fetches the number's status for the settings page.

Webhooks arrive at `GET/POST /webhooks/whatsapp` (verify token handshake, `X-Hub-Signature-256`
check, then `messages`, status and `account_update` events matched to the tenant by WABA ID).

Meta-side setup steps are in [`docs/meta-setup.md`](docs/meta-setup.md).
