# AutoShift

AutoShift's public website and its WhatsApp CRM, in one Next.js app on Supabase.

| Route | What it is |
|---|---|
| `/` | The AutoShift website: a self-contained page in [`public/site/index.html`](public/site/index.html) (its own data, styles, hash routing and editor) |
| `/tools`, `/tools/*` | Free WhatsApp tools: link generator, QR code generator, text formatter, chat button |
| `/release-notes` | Product release notes |
| `/login`, `/signup` | CRM sign-in (Supabase Auth) |
| `/dashboard`, `/inbox`, `/contacts`, `/pipelines`, `/broadcasts`, `/automations`, `/flows`, `/agents`, `/settings` | The CRM |

## What the CRM does
- **Shared inbox** on the official WhatsApp Business API: assignment, status, notes, quick replies, media, voice notes.
- **Contacts** with tags, custom fields, CSV import and de-duplication.
- **Sales pipelines** (Kanban), with deals linked to conversations.
- **Broadcasts** with Meta-approved templates and delivery/read tracking.
- **Automations and flows:** no-code triggers, conditions, waits and webhooks, plus a visual builder.
- **AI reply assistant** (your own OpenAI/Anthropic key), auto-reply and a knowledge base.
- **Dashboard:** response times, message volume, pipeline value, reply queue.
- **Teams:** invites and roles (owner/admin/agent/viewer), a public REST API with scoped keys, and an MCP server in [`mcp-server/`](mcp-server).

## Design
The CRM uses the website's design language, defined in [`src/app/globals.css`](src/app/globals.css):
- **Surfaces:** a warm cream ground (`#FAF8F4`), white rounded cards, `#E7E3DA` lines and ink `#1A1D1B`.
- **Colour:** one green for actions (`#1E4C41`), plus pastel tones for tinted panels.
- **Type and shape:** Plus Jakarta Sans, and pill-shaped buttons.
- **Modes:** light is the default; dark mode and other accents can be picked in Settings → Appearance.

## Run it locally
Requires Node.js 22.12+ and a Supabase project.

```bash
npm install
cp .env.local.example .env.local   # Supabase URL/keys, ENCRYPTION_KEY, META_APP_SECRET
npm run dev                        # http://localhost:3000
```

Apply the database schema by running `supabase/migrations/*.sql` in order (Supabase SQL editor, or `supabase db push`).

Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

## Documentation
- [Public REST API](docs/public-api.md)
- [MCP server](docs/mcp.md)
- [Several WhatsApp Business Accounts](docs/multi-waba.md)
- [Troubleshooting the WhatsApp connection](docs/whatsapp-connection-troubleshooting.md)
- [Auth emails](docs/auth-emails.md)
- [Docker](docs/docker.md)

## Credits and licence
The CRM is built on [wacrm](https://github.com/ArnasDon/wacrm) by Arnas Donauskas, used under the
MIT licence (see [`LICENSE`](LICENSE)). Its upstream history is in
[`docs/upstream-wacrm-changelog.md`](docs/upstream-wacrm-changelog.md). WhatsApp is a trademark of
Meta Platforms, Inc.
