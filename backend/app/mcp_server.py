"""The MCP server: AutoShift's tools for AI assistants.

It is a thin layer. Every tool calls the same REST API the website uses (in-process),
with the caller's own API key, so role checks, validation, audit and the read-only
scope behave identically. Nothing here talks to the database directly.

Safety rules baked in:
  * Only API keys (asmcp_...) are accepted. Account keys reach one workspace; platform
    keys reach platform routes; neither can reach the other's routes.
  * Anything that sends money, deletes data or cancels needs `confirm=true`; without it
    the tool only describes what it would do.
  * No tool accepts or returns a secret: provider API keys and connection secrets are
    entered in the app, never through an AI.
"""

import contextvars
import json
from typing import Any

import httpx
from fastapi import FastAPI
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError

from mcp.server.transport_security import TransportSecuritySettings

from .config import get_settings
from .security import KEY_PREFIX

_auth: contextvars.ContextVar[str | None] = contextvars.ContextVar("mcp_auth", default=None)


class AuthCapture:
    """ASGI wrapper: keeps the caller's key for the tools and refuses anything that isn't one."""

    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.inner(scope, receive, send)
        headers = {k.decode().lower(): v.decode() for k, v in scope["headers"]}
        value = headers.get("authorization", "")
        if not value.lower().startswith("bearer ") or not value[7:].strip().startswith(KEY_PREFIX):
            body = json.dumps({"error": "Use an AutoShift API key (asmcp_...) as a Bearer token"}).encode()
            await send({"type": "http.response.start", "status": 401, "headers": [(b"content-type", b"application/json"), (b"www-authenticate", b"Bearer")]})
            await send({"type": "http.response.body", "body": body})
            return
        token = _auth.set(value)
        try:
            await self.inner(scope, receive, send)
        finally:
            _auth.reset(token)


class ToolFailure(ToolError):
    """Shown to the AI as the tool's error message."""


def build_mcp(get_app) -> MCPServer:
    mcp = MCPServer(
        "autoshift",
        instructions=(
            "AutoShift runs WhatsApp assistants, flows, a wallet and plans for businesses. "
            "Use the account tools with a workspace key, the platform_* tools with a platform key. "
            "Tools that move money, delete or cancel need confirm=true; call them first without it to preview."
        ),
    )

    async def call(method: str, path: str, *, json_body: Any = None, params: dict | None = None) -> Any:
        auth = _auth.get()
        if not auth:
            raise ToolFailure("Not signed in")
        transport = httpx.ASGITransport(app=get_app())
        async with httpx.AsyncClient(transport=transport, base_url="http://autoshift.internal") as client:
            res = await client.request(method, path, json=json_body, params=params, headers={"Authorization": auth})
        if res.status_code >= 400:
            try:
                detail = res.json().get("detail", res.text)
            except ValueError:
                detail = res.text
            raise ToolFailure(f"{res.status_code}: {detail}")
        return res.json() if res.content else {"ok": True}

    def preview(action: str, **details: Any) -> dict[str, Any]:
        return {"confirmation_required": True, "would": action, **details, "next": "Call again with confirm=true to do it."}

    # ----------------------------------------------------------- workspace tools
    @mcp.tool()
    async def whoami() -> dict:
        """Who this key acts as: the user, workspace and role."""
        return await call("GET", "/v1/me")

    @mcp.tool()
    async def assistants_list() -> list:
        """List the workspace's AI assistants."""
        return await call("GET", "/v1/assistants")

    @mcp.tool()
    async def assistants_get(assistant_id: str) -> dict:
        """Get one AI assistant by id."""
        return await call("GET", f"/v1/assistants/{assistant_id}")

    @mcp.tool()
    async def assistants_create(name: str, instructions: str = "", greeting: str = "", provider: str = "openai", model_id: str = "", tone: str = "friendly") -> dict:
        """Create an AI assistant (needs a write key and the admin role). It starts switched off."""
        return await call("POST", "/v1/assistants", json_body={"name": name, "instructions": instructions, "greeting": greeting, "provider": provider, "model_id": model_id, "tone": tone})

    @mcp.tool()
    async def assistants_update(assistant_id: str, name: str | None = None, instructions: str | None = None, greeting: str | None = None, enabled: bool | None = None, tone: str | None = None, provider: str | None = None, model_id: str | None = None) -> dict:
        """Change an assistant. Only the fields you pass are changed."""
        patch = {k: v for k, v in {"name": name, "instructions": instructions, "greeting": greeting, "enabled": enabled, "tone": tone, "provider": provider, "model_id": model_id}.items() if v is not None}
        if not patch:
            raise ToolFailure("Nothing to change")
        return await call("PATCH", f"/v1/assistants/{assistant_id}", json_body=patch)

    @mcp.tool()
    async def assistants_delete(assistant_id: str, confirm: bool = False) -> dict:
        """Delete an assistant. Needs confirm=true."""
        found = await call("GET", f"/v1/assistants/{assistant_id}")
        if not confirm:
            return preview("delete this assistant", assistant=found["name"])
        return await call("DELETE", f"/v1/assistants/{assistant_id}")

    @mcp.tool()
    async def assistants_test_reply(assistant_id: str, message: str, idempotency_key: str, confirm: bool = False) -> dict:
        """Try an assistant on a sample message. Uses the real AI and costs one AI reply from the wallet, so it needs confirm=true.
        Reuse the same idempotency_key to retry without paying twice."""
        if not confirm:
            return preview("run a real AI reply and charge one AI reply to the wallet", assistant_id=assistant_id)
        return await call("POST", f"/v1/assistants/{assistant_id}/test-reply", json_body={"message": message, "idempotency_key": idempotency_key})

    @mcp.tool()
    async def hooks_list() -> list:
        """Outgoing webhooks (where AutoShift sends events). Secrets are never shown."""
        return await call("GET", "/v1/hooks")

    @mcp.tool()
    async def hooks_ping(hook_id: str) -> dict:
        """Send a test event to a webhook now and report what the receiver answered."""
        return await call("POST", f"/v1/hooks/{hook_id}/ping")

    @mcp.tool()
    async def hooks_deliveries(hook_id: str) -> list:
        """Recent deliveries for a webhook, with status and errors."""
        return await call("GET", f"/v1/hooks/{hook_id}/deliveries")

    # ------------------------------------------------- team, tools, usage, support
    @mcp.tool()
    async def usage_get() -> dict:
        """Seats, contacts and this month's AI replies, against the plan's limits."""
        return await call("GET", "/v1/usage")

    @mcp.tool()
    async def team_list() -> list:
        """Everyone on the workspace and their role."""
        return await call("GET", "/v1/team")

    @mcp.tool()
    async def team_set_role(user_id: str, role: str) -> dict:
        """Change a teammate's role to admin, agent or viewer (admin role needed; not the owner, not yourself)."""
        return await call("PATCH", f"/v1/team/{user_id}", json_body={"role": role})

    @mcp.tool()
    async def team_remove(user_id: str, confirm: bool = False) -> dict:
        """Remove a teammate (they keep their login with an empty workspace). Needs confirm=true."""
        if not confirm:
            return preview("remove this person from the workspace", user_id=user_id)
        return await call("DELETE", f"/v1/team/{user_id}")

    @mcp.tool()
    async def team_invite(role: str, label: str = "", confirm: bool = False) -> dict:
        """Create a one-time join link for a new teammate (admin, agent or viewer). Needs confirm=true.
        Anyone with the link can join, so share it only with that person."""
        if not confirm:
            return preview(f"create a join link with the {role} role", note="Anyone holding the link can join the workspace.")
        return await call("POST", "/v1/team/invitations", json_body={"role": role, "label": label})

    @mcp.tool()
    async def tools_list() -> list:
        """The tools assistants can use: built-in ones and the workspace's webhook tools."""
        return await call("GET", "/v1/tools")

    @mcp.tool()
    async def tools_set_enabled(key: str, enabled: bool) -> dict:
        """Switch a tool on or off for every assistant."""
        return await call("PATCH", f"/v1/tools/{key}", json_body={"enabled": enabled})

    @mcp.tool()
    async def support_list() -> list:
        """The workspace's support requests to AutoShift, with replies."""
        return await call("GET", "/v1/support/tickets")

    @mcp.tool()
    async def support_open(subject: str, message: str, category: str = "Other", priority: str = "normal") -> dict:
        """Open a support request with AutoShift. Category: WhatsApp connection, Billing, Templates, AI assistant, Bug or Other."""
        return await call("POST", "/v1/support/tickets", json_body={"subject": subject, "message": message, "category": category, "priority": priority})

    @mcp.tool()
    async def support_reply(ticket_number: int, text: str) -> dict:
        """Add a reply to one of the workspace's support requests."""
        return await call("POST", f"/v1/support/tickets/{ticket_number}/messages", json_body={"text": text})

    @mcp.tool()
    async def announcements_list() -> list:
        """News and notices from AutoShift meant for this workspace."""
        return await call("GET", "/v1/announcements")

    @mcp.tool()
    async def connections_list() -> list:
        """List connected accounts (Google, Razorpay). Secrets are never shown."""
        return await call("GET", "/v1/connections")

    @mcp.tool()
    async def connections_delete(connection_id: str, confirm: bool = False) -> dict:
        """Remove a connected account. Flows that use it stop working. Needs confirm=true."""
        if not confirm:
            return preview("remove this connection", connection_id=connection_id)
        return await call("DELETE", f"/v1/connections/{connection_id}")

    @mcp.tool()
    async def wallet_balance() -> dict:
        """The wallet balance (in paise; 100 paise = ₹1) and the rate card."""
        return await call("GET", "/v1/wallet")

    @mcp.tool()
    async def wallet_ledger(limit: int = 20) -> list:
        """Recent wallet entries, newest first (admin role)."""
        return await call("GET", "/v1/wallet/ledger", params={"limit": limit})

    @mcp.tool()
    async def invoices_list(limit: int = 20) -> list:
        """GST invoices, newest first (admin role)."""
        return await call("GET", "/v1/wallet/invoices", params={"limit": limit})

    @mcp.tool()
    async def plans_list() -> list:
        """The plans and their monthly and yearly prices (in paise)."""
        return await call("GET", "/v1/plans")

    @mcp.tool()
    async def subscription_get() -> dict:
        """The workspace's plan, trial and renewal status."""
        return await call("GET", "/v1/subscription")

    @mcp.tool()
    async def subscription_cancel(confirm: bool = False) -> dict:
        """Stop renewal at the end of the paid period. Needs confirm=true."""
        if not confirm:
            sub = await call("GET", "/v1/subscription")
            return preview("stop the subscription renewing", plan=sub["plan_id"], runs_until=sub.get("current_period_end") or sub["trial_ends_at"])
        return await call("POST", "/v1/subscription/cancel")

    @mcp.tool()
    async def ai_models_available() -> list:
        """The AI providers and models a business may pick for its assistants."""
        return await call("GET", "/v1/ai-models/available")

    # ------------------------------------------------------------ platform tools
    @mcp.tool()
    async def platform_ai_models() -> dict:
        """Platform key: providers (on/off, last four characters of each key) and models."""
        return await call("GET", "/v1/platform/ai-models")

    @mcp.tool()
    async def platform_ai_provider_enable(vendor: str, enabled: bool, confirm: bool = False) -> dict:
        """Platform key: switch an AI provider on or off for every business. Needs confirm=true.
        API keys can't be set here; add them in the admin panel."""
        if not confirm:
            return preview(f"switch {vendor} {'on' if enabled else 'off'} for every business")
        return await call("PUT", f"/v1/platform/ai-providers/{vendor}", json_body={"enabled": enabled})

    @mcp.tool()
    async def platform_ai_model_update(vendor: str, model_id: str, enabled: bool | None = None, make_default: bool | None = None) -> dict:
        """Platform key: switch a model on or off, or make it the platform default."""
        body = {k: v for k, v in {"enabled": enabled, "is_default": make_default}.items() if v is not None}
        return await call("PATCH", f"/v1/platform/ai-providers/{vendor}/models/{model_id}", json_body=body)

    @mcp.tool()
    async def platform_businesses_list() -> list:
        """Platform key: every business with plan, status, team size and wallet."""
        return await call("GET", "/v1/platform/businesses")

    @mcp.tool()
    async def platform_business_get(account_id: str) -> dict:
        """Platform key: one business with its team."""
        return await call("GET", f"/v1/platform/businesses/{account_id}")

    @mcp.tool()
    async def platform_business_suspend(account_id: str, suspended: bool, reason: str = "", confirm: bool = False) -> dict:
        """Platform key (support): suspend a business (locks out its users and API keys, keeps data) or reactivate it. Needs confirm=true."""
        if not confirm:
            return preview(f"{'suspend' if suspended else 'reactivate'} this business", account_id=account_id, reason=reason)
        return await call("POST", f"/v1/platform/businesses/{account_id}/suspend", json_body={"suspended": suspended, "reason": reason})

    @mcp.tool()
    async def platform_overview() -> dict:
        """Platform key: businesses, trials, paying subscriptions, revenue and wallet float."""
        return await call("GET", "/v1/platform/overview")

    @mcp.tool()
    async def platform_payments(limit: int = 50) -> list:
        """Platform key: recent top-ups and subscription charges with invoice numbers."""
        return await call("GET", "/v1/platform/payment-feed", params={"limit": limit})

    @mcp.tool()
    async def platform_tickets(status: str | None = None) -> list:
        """Platform key: support requests from every business (status: open, pending or closed)."""
        return await call("GET", "/v1/platform/tickets", params={"status": status} if status else None)

    @mcp.tool()
    async def platform_ticket_reply(ticket_number: int, text: str, note: bool = False, close: bool = False) -> dict:
        """Platform key (support): reply to a business (they see it), or add a staff-only note with note=true."""
        return await call("POST", f"/v1/platform/tickets/{ticket_number}/messages", json_body={"text": text, "note": note, "close": close})

    @mcp.tool()
    async def platform_announce(title: str, body: str, audience: str = "all", kind: str = "news", confirm: bool = False) -> dict:
        """Platform key (support): publish an announcement to businesses now (audience: all, trial, paying, starter, growth, pro). Needs confirm=true."""
        if not confirm:
            return preview("publish this announcement to businesses now", title=title, audience=audience)
        return await call("POST", "/v1/platform/announcements", json_body={"title": title, "body": body, "audience": audience, "kind": kind})

    @mcp.tool()
    async def platform_admins() -> list:
        """Platform key: the AutoShift admin team. (Adding admins is done in the admin panel, never by an AI.)"""
        return await call("GET", "/v1/platform/admins")

    @mcp.tool()
    async def platform_business_close(account_id: str, business_name: str, confirm: bool = False) -> dict:
        """Platform key (super admin): close a business now. Cancels billing, deletes its customers, chats and
        settings, keeps invoices and the wallet ledger. Can't be undone. Needs confirm=true and the exact business name."""
        if not confirm:
            b = await call("GET", f"/v1/platform/businesses/{account_id}")
            return preview("close this business and delete its data (money records are kept)", business=b["name"], wallet_paise=b["wallet_paise"])
        return await call("POST", f"/v1/platform/businesses/{account_id}/close", json_body={"confirm_name": business_name})

    @mcp.tool()
    async def platform_settings() -> dict:
        """Platform key: platform switches, e.g. who Meta bills for WhatsApp messages."""
        return await call("GET", "/v1/platform/settings")

    @mcp.tool()
    async def platform_audit(limit: int = 50) -> list:
        """Platform key: the audit log, newest first."""
        return await call("GET", "/v1/platform/audit", params={"limit": limit})

    @mcp.tool()
    async def platform_wallet_get(account_id: str) -> dict:
        """Platform key: a business's wallet balance and recent ledger."""
        return await call("GET", f"/v1/platform/wallets/{account_id}")

    @mcp.tool()
    async def platform_wallet_adjust(account_id: str, amount_paise: int, reason: str, idempotency_key: str, confirm: bool = False) -> dict:
        """Platform key (finance): add (+) or remove (-) credits. Needs confirm=true. Reuse the same idempotency_key to retry safely."""
        if not confirm:
            return preview("change this wallet", account_id=account_id, amount_paise=amount_paise, reason=reason)
        return await call("POST", f"/v1/platform/wallets/{account_id}/adjust", json_body={"amount_paise": amount_paise, "reason": reason, "idempotency_key": idempotency_key})

    @mcp.tool()
    async def platform_refund(payment_id: str, reason: str, amount_paise: int | None = None, confirm: bool = False) -> dict:
        """Platform key (finance): refund a wallet top-up through Razorpay. Needs confirm=true."""
        if not confirm:
            return preview("refund this payment through Razorpay", payment_id=payment_id, amount_paise=amount_paise or "the full amount", reason=reason)
        body: dict[str, Any] = {"reason": reason}
        if amount_paise:
            body["amount_paise"] = amount_paise
        return await call("POST", f"/v1/platform/payments/{payment_id}/refund", json_body=body)

    return mcp


def mount_mcp(app: FastAPI) -> MCPServer:
    mcp = build_mcp(lambda: app)
    security = TransportSecuritySettings(enable_dns_rebinding_protection=True, allowed_hosts=get_settings().mcp_hosts, allowed_origins=[])
    sub = mcp.streamable_http_app(streamable_http_path="/", stateless_http=True, json_response=True, transport_security=security)
    app.mount("/mcp", AuthCapture(sub))
    return mcp
