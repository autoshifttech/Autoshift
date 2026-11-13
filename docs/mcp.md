# MCP server

AutoShift ships a [Model Context Protocol](https://modelcontextprotocol.io)
server so you can drive your CRM from AI assistants — Claude Desktop,
Claude Code, Cursor, and any other MCP client — in natural language:

> "How many conversations are still open today?"
> "Show the last five messages with +1 415 555 0123."
> "Send the `order_update` template to that contact."

It lives in [`mcp-server/`](../mcp-server) and is published to npm as
[`autoshift-mcp`](https://www.npmjs.com/package/autoshift-mcp). Under the hood
it's a thin wrapper over the [public API](./public-api.md), so every
request is authenticated and scoped by your instance exactly like any
other API call.

## Quick start

1. Create an API key in the dashboard: **Settings → API keys**. Grant
   only the scopes your assistant needs (a read-only assistant only
   needs the `*:read` scopes).
2. Add the server to your MCP client config:

   ```jsonc
   {
     "mcpServers": {
       "autoshift": {
         "command": "npx",
         "args": ["-y", "autoshift-mcp"],
         "env": {
           "AUTOSHIFT_BASE_URL": "https://crm.example.com",
           "AUTOSHIFT_API_KEY": "autoshift_live_xxxxxxxxxxxxxxxxxxxxxxxx"
         }
       }
     }
   }
   ```

That's **read-only** — the safe default. To let the assistant change
data or send messages, add `"AUTOSHIFT_ENABLE_WRITES": "true"` (and
`"AUTOSHIFT_ENABLE_BROADCASTS": "true"` for mass sends) to `env`.

## What it exposes

- **Reads (always on):** `whoami`, contacts (list/get), conversations
  (list/get), messages (list), broadcast status.
- **Writes (opt-in):** send a message, create/update a contact.
- **Broadcasts (opt-in):** launch a template broadcast — requires an
  explicit `confirm` and is marked destructive.

## Safety

Because sending WhatsApp messages is a real side effect, the server is
**read-only until you opt in**, layered on top of the API key's own
scopes. Give an assistant a read-only key and read-only config and it
physically cannot send anything. See the
[server README](../mcp-server/README.md) for the full tool list and
safety model.

## Hosted MCP server (`/mcp/` on the API)

The backend also serves MCP over HTTP at `https://<api>/mcp/` with an API key in
`Authorization: Bearer …` or `X-API-Key`. It has 166 tools and 8 prompts:

- **Business keys** see the business tools (90) and 5 prompts (daily summary, follow up
  cold leads, fix my WhatsApp, weekly business report, clean my contacts).
- **Platform keys** see the admin tools (76) and 3 prompts (morning check, weekly business
  review, investigate a business). `whoami` and custom tools are shared.
- **Groups:** `…/mcp/?groups=chats,contacts` shows only those groups. Business groups:
  account, chats, contacts, leads, campaigns, automation, ai, whatsapp, team,
  integrations, insights. Admin groups: admin-reports, admin-businesses, admin-users,
  admin-money, admin-pricing, admin-whatsapp-ai, admin-support, admin-system (`admin` = all).

Safety built in:

- Read-only keys can't change anything; roles still apply (viewer, agent, admin, owner and staff roles).
- Sending, spending, deleting and cancelling tools return a preview first and need `confirm=true`.
- Daily limits per key (300 messages, 2,000 broadcast recipients, 200 AI replies; change them
  in `platform_settings.api_key_limits`) and 120 calls a minute per key.
- `request_id` on `messages_send` and `broadcast_create`: a retry with the same id never sends twice.
- Opted-out (STOP) and blocked people are never messaged, including scheduled broadcasts, which
  are checked again at send time.
- Customer message text is marked as data, not instructions.
- No tool returns or accepts secrets, grants admin access, closes a business or removes a login;
  those stay in the admin panel. Every change is in the audit log.
- Heavy admin reports are cached for 2 minutes for API keys.
