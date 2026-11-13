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

    # ------------------------------------------------------- messaging (WhatsApp)
    def _send_body(to, conversation_id, text, template_name, template_language, body_params, header_media_url, header_text, media_url, media_type, filename, name) -> dict:
        body: dict[str, Any] = {k: v for k, v in {"to": to, "conversation_id": conversation_id, "text": text, "media_url": media_url, "media_type": media_type, "filename": filename, "name": name}.items() if v}
        if template_name:
            body["template"] = {"name": template_name, "language": template_language, "body_params": body_params or [], "header_media_url": header_media_url, "header_text": header_text}
        return body

    @mcp.tool()
    async def messages_send(
        to: str | None = None,
        conversation_id: str | None = None,
        text: str | None = None,
        template_name: str | None = None,
        template_language: str = "en_US",
        body_params: list[str] | None = None,
        header_media_url: str | None = None,
        header_text: str | None = None,
        media_url: str | None = None,
        media_type: str | None = None,
        filename: str | None = None,
        name: str | None = None,
        confirm: bool = False,
    ) -> dict:
        """Send a WhatsApp message to a phone (to, with country code) or an existing conversation_id. Needs confirm=true.
        Free text or media only works within 24 hours of the customer's last message; otherwise use an APPROVED
        template (template_name, body_params for {{1}}, {{2}}..., header_media_url https link for an image/video/document header).
        People who sent STOP and blocked numbers are always refused. Agent role needed."""
        body = _send_body(to, conversation_id, text, template_name, template_language, body_params, header_media_url, header_text, media_url, media_type, filename, name)
        check = await call("POST", "/v1/ws/messages/check", json_body=body)
        if not check["can_send"]:
            raise ToolFailure("Can't send: " + "; ".join(check["blockers"]))
        if not confirm:
            return preview("send this WhatsApp message", to=check["to"], kind=check["kind"], template=check["template"], text=text)
        return await call("POST", "/v1/ws/messages/send", json_body=body)

    @mcp.tool()
    async def whatsapp_status() -> dict:
        """Whether the workspace's WhatsApp number is connected, with its ids and last registration error."""
        return await call("GET", "/v1/ws/whatsapp")

    @mcp.tool()
    async def conversations_list(status: str | None = None, unread_only: bool = False, limit: int = 30) -> list:
        """Inbox chats, newest first. status: open, pending or closed."""
        params: dict[str, Any] = {"limit": limit, "unread_only": unread_only}
        if status:
            params["status"] = status
        return await call("GET", "/v1/ws/conversations", params=params)

    @mcp.tool()
    async def conversation_get(conversation_id: str, limit: int = 30) -> dict:
        """One chat with its latest messages, and whether free text can still be sent (24-hour window)."""
        return await call("GET", f"/v1/ws/conversations/{conversation_id}", params={"limit": limit})

    @mcp.tool()
    async def conversation_update(conversation_id: str, status: str | None = None, assigned_to: str | None = None, ai_paused: bool | None = None, mark_read: bool | None = None) -> dict:
        """Close/reopen a chat (status open, pending, closed), assign it to a teammate's user id ('none' to unassign),
        pause or resume the AI for it, or mark it read."""
        body = {k: v for k, v in {"status": status, "assigned_to": assigned_to, "ai_paused": ai_paused, "mark_read": mark_read}.items() if v is not None}
        return await call("PATCH", f"/v1/ws/conversations/{conversation_id}", json_body=body)

    @mcp.tool()
    async def templates_list(status: str | None = None) -> list:
        """WhatsApp message templates (status: APPROVED, PENDING, REJECTED...). Run templates_sync first if one is missing."""
        return await call("GET", "/v1/ws/templates", params={"status": status} if status else None)

    @mcp.tool()
    async def templates_sync() -> dict:
        """Pull the latest templates and their approval status from Meta (admin role)."""
        return await call("POST", "/v1/ws/templates/sync")

    @mcp.tool()
    async def templates_create(name: str, category: str, body_text: str, body_samples: list[str] | None = None, language: str = "en_US", footer_text: str | None = None, header_type: str | None = None, header_content: str | None = None, confirm: bool = False) -> dict:
        """Submit a new template to Meta for approval (admin role). Needs confirm=true.
        name: lower_case_with_underscores. category: Marketing, Utility or Authentication. Use {{1}}, {{2}} in body_text
        with one example per variable in body_samples. header_type text/image/video/document; header_content is the text or an https sample link."""
        body = {k: v for k, v in {"name": name, "category": category, "language": language, "body_text": body_text, "body_samples": body_samples or [], "footer_text": footer_text, "header_type": header_type, "header_content": header_content}.items() if v is not None}
        if not confirm:
            return preview("submit this template to Meta for approval", **body)
        return await call("POST", "/v1/ws/templates", json_body=body)

    @mcp.tool()
    async def templates_delete(template_id: str, confirm: bool = False) -> dict:
        """Delete a template at Meta and in AutoShift (admin role). Meta won't accept a new template with the same
        name for about 30 days. Can't be undone. Needs confirm=true. Get ids from templates_list."""
        found = next((t for t in await call("GET", "/v1/ws/templates") if t["id"] == template_id), None)
        if not found:
            raise ToolFailure("Template not found")
        if not confirm:
            return preview("delete this template at Meta and in AutoShift", template=found["name"], language=found["language"], status=found["status"])
        return await call("DELETE", f"/v1/ws/templates/{template_id}")

    # ----------------------------------------------------------- contacts and leads
    @mcp.tool()
    async def contacts_search(query: str | None = None, tag: str | None = None, limit: int = 50) -> list:
        """Find contacts by name, phone, email or company, and/or by tag."""
        params: dict[str, Any] = {"limit": limit}
        if query:
            params["q"] = query
        if tag:
            params["tag"] = tag
        return await call("GET", "/v1/ws/contacts", params=params)

    @mcp.tool()
    async def contact_get(contact_id: str) -> dict:
        """One contact with tags, and whether they opted out or are blocked."""
        return await call("GET", f"/v1/ws/contacts/{contact_id}")

    @mcp.tool()
    async def contacts_create(phone: str, name: str | None = None, email: str | None = None, company: str | None = None, tags: list[str] | None = None) -> dict:
        """Add a contact (phone with country code, e.g. +919876543210)."""
        return await call("POST", "/v1/ws/contacts", json_body={"phone": phone, "name": name, "email": email, "company": company, "tags": tags or []})

    @mcp.tool()
    async def contacts_update(contact_id: str, name: str | None = None, email: str | None = None, company: str | None = None, add_tags: list[str] | None = None, remove_tags: list[str] | None = None) -> dict:
        """Change a contact's details or tags. Only what you pass changes."""
        body = {k: v for k, v in {"name": name, "email": email, "company": company}.items() if v is not None}
        body.update(add_tags=add_tags or [], remove_tags=remove_tags or [])
        return await call("PATCH", f"/v1/ws/contacts/{contact_id}", json_body=body)

    @mcp.tool()
    async def contacts_delete(contact_id: str, confirm: bool = False) -> dict:
        """Delete a contact and their chats (admin role). Can't be undone. Needs confirm=true."""
        found = await call("GET", f"/v1/ws/contacts/{contact_id}")
        if not confirm:
            return preview("delete this contact and their chat history", contact={k: found.get(k) for k in ("name", "phone")})
        return await call("DELETE", f"/v1/ws/contacts/{contact_id}")

    @mcp.tool()
    async def leads_list(status: str | None = None, limit: int = 50) -> list:
        """Leads in the sales pipeline with stage, value and contact. status: open, won or lost."""
        params: dict[str, Any] = {"limit": limit}
        if status:
            params["status"] = status
        return await call("GET", "/v1/ws/leads", params=params)

    @mcp.tool()
    async def lead_update(lead_id: str, stage: str | None = None, status: str | None = None, value: float | None = None, notes: str | None = None, assigned_to: str | None = None) -> dict:
        """Move a lead to another stage (name or id), mark it won/lost/open, change its value or notes, or assign it."""
        body = {k: v for k, v in {"stage": stage, "status": status, "value": value, "notes": notes, "assigned_to": assigned_to}.items() if v is not None}
        return await call("PATCH", f"/v1/ws/leads/{lead_id}", json_body=body)

    @mcp.tool()
    async def segments_list() -> list:
        """Customer groups (tags) and how many people are in each. Use a tag as a broadcast audience."""
        return await call("GET", "/v1/ws/segments")

    @mcp.tool()
    async def optouts_list(limit: int = 100) -> list:
        """People who sent STOP (and haven't sent START since) and blocked numbers. They are never messaged."""
        return await call("GET", "/v1/ws/optouts", params={"limit": limit})

    @mcp.tool()
    async def blocklist_add(contact_id: str | None = None, phone: str | None = None, blocked: bool = True, confirm: bool = False) -> dict:
        """Block a number (no messages or broadcasts go to it), or unblock with blocked=false (admin role). Needs confirm=true."""
        if not confirm:
            return preview("block this number" if blocked else "unblock this number", contact_id=contact_id, phone=phone)
        return await call("POST", "/v1/ws/blocklist", json_body={"contact_id": contact_id, "phone": phone, "blocked": blocked})

    # ------------------------------------------------------ campaigns and automation
    @mcp.tool()
    async def broadcasts_list(limit: int = 20) -> list:
        """Recent broadcasts with sent, delivered, read and failed counts."""
        return await call("GET", "/v1/ws/broadcasts", params={"limit": limit})

    @mcp.tool()
    async def broadcast_get(broadcast_id: str) -> dict:
        """One broadcast with recipients by status and the most common errors."""
        return await call("GET", f"/v1/ws/broadcasts/{broadcast_id}")

    @mcp.tool()
    async def broadcast_create(template_name: str, tag: str | None = None, recipients: list[dict] | None = None, params: list[str] | None = None, template_language: str = "en_US", name: str | None = None, confirm: bool = False) -> dict:
        """Send an APPROVED template to everyone with a tag, or to recipients [{"to": "+91...", "params": ["Asha"]}] (up to 1000).
        params are body values used for everyone when sending to a tag. People who opted out or are blocked are skipped.
        Marketing templates cost wallet credit per message. Needs confirm=true."""
        body = {"template_name": template_name, "template_language": template_language, "name": name, "tag": tag, "recipients": recipients or [], "params": params or []}
        check = await call("POST", "/v1/ws/broadcasts/check", json_body=body)
        if not confirm:
            return preview("send this broadcast now", **check)
        return await call("POST", "/v1/ws/broadcasts", json_body=body)

    @mcp.tool()
    async def broadcast_cancel(broadcast_id: str, confirm: bool = False) -> dict:
        """Cancel a draft or scheduled broadcast. Needs confirm=true."""
        found = await call("GET", f"/v1/ws/broadcasts/{broadcast_id}")
        if not confirm:
            return preview("cancel this broadcast", broadcast=found.get("name"), status=found.get("status"))
        return await call("POST", f"/v1/ws/broadcasts/{broadcast_id}/cancel")

    @mcp.tool()
    async def broadcast_delete(broadcast_id: str, confirm: bool = False) -> dict:
        """Delete a broadcast and its recipient list (admin role). Messages already sent stay in the chats.
        Not while it is sending. Can't be undone. Needs confirm=true."""
        found = await call("GET", f"/v1/ws/broadcasts/{broadcast_id}")
        if not confirm:
            return preview("delete this broadcast and its recipient list", broadcast=found.get("name"), status=found.get("status"), sent=found.get("sent_count"))
        return await call("DELETE", f"/v1/ws/broadcasts/{broadcast_id}")

    @mcp.tool()
    async def automations_list() -> list:
        """Automations with their trigger, on/off state and run counts."""
        return await call("GET", "/v1/ws/automations")

    @mcp.tool()
    async def automation_toggle(automation_id: str, active: bool) -> dict:
        """Switch an automation on or off (admin role)."""
        return await call("PATCH", f"/v1/ws/automations/{automation_id}", json_body={"active": active})

    @mcp.tool()
    async def flows_list() -> list:
        """Chat flows with their status (draft, active, archived), trigger and run counts."""
        return await call("GET", "/v1/ws/flows")

    @mcp.tool()
    async def flow_toggle(flow_id: str, active: bool) -> dict:
        """Turn a flow on (active) or off (back to draft) (admin role)."""
        return await call("PATCH", f"/v1/ws/flows/{flow_id}", json_body={"active": active})

    # --------------------------------------------------------- AI, insights, money
    @mcp.tool()
    async def knowledge_list() -> list:
        """Documents the AI assistants answer from."""
        return await call("GET", "/v1/ws/knowledge")

    @mcp.tool()
    async def knowledge_add(title: str, content: str) -> dict:
        """Add a document the AI assistants can answer from, e.g. opening hours, prices, policies (admin role)."""
        return await call("POST", "/v1/ws/knowledge", json_body={"title": title, "content": content})

    @mcp.tool()
    async def insights_get(days: int = 30) -> dict:
        """Business results over the last N days: chats, reply speed, AI replies, leads won, broadcast reach."""
        return await call("GET", "/v1/ws/insights", params={"days": days})

    @mcp.tool()
    async def hooks_create(url: str, events: list[str] | None = None, label: str = "") -> dict:
        """Add an outgoing webhook (e.g. an n8n URL) for events such as message.received or lead.created (admin role).
        The signing secret is shown once in the app, never to the AI."""
        res = await call("POST", "/v1/hooks", json_body={"url": url, "events": events or ["*"], "label": label})
        res.pop("secret", None)
        return {**res, "note": "Signing secret not shown here; copy it from Settings, or delete and recreate the webhook in the app."}

    @mcp.tool()
    async def hooks_delete(hook_id: str, confirm: bool = False) -> dict:
        """Delete an outgoing webhook (admin role). Needs confirm=true."""
        if not confirm:
            return preview("delete this webhook", hook_id=hook_id)
        return await call("DELETE", f"/v1/hooks/{hook_id}")

    @mcp.tool()
    async def wallet_topup_link(amount_inr: int, confirm: bool = False) -> dict:
        """A link where the business owner tops up the wallet themselves (payment happens in the app; the AI never pays).
        Needs confirm=true."""
        settings = get_settings()
        if not settings.topup_min_inr <= amount_inr <= settings.topup_max_inr:
            raise ToolFailure(f"Top-ups are between ₹{settings.topup_min_inr} and ₹{settings.topup_max_inr}")
        if not confirm:
            return preview("create a wallet top-up link", amount_inr=amount_inr, note="GST is added at checkout.")
        return {"url": f"{settings.site_url.rstrip('/')}/wallet?topup={amount_inr}", "amount_inr": amount_inr, "note": "Open it while signed in to pay."}

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

    # ------------------------------------------------- custom tools (made in the admin panel)
    async def _custom(path: str, method: str = "GET", body: Any = None) -> Any:
        """Workspace route first; a platform key falls through to the staff route."""
        try:
            return await call(method, f"/v1/custom-tools{path}", json_body=body)
        except ToolFailure as exc:
            if "platform use" not in str(exc):
                raise
        return await call(method, f"/v1/platform/custom-tools{path if path else '/available'}", json_body=body)

    @mcp.tool()
    async def custom_tools_list() -> list:
        """Extra tools the AutoShift team added in the admin panel, with their inputs. Run one with custom_tool_run."""
        return await _custom("")

    @mcp.tool()
    async def custom_tool_run(name: str, arguments: dict | None = None, confirm: bool = False) -> dict:
        """Run a custom tool by name with its inputs (see custom_tools_list). Tools marked needs_confirm
        only describe what they'd do until you call again with confirm=true."""
        return await _custom(f"/run/{name}", "POST", {"arguments": arguments or {}, "confirm": confirm})

    # ------------------------------------------------- platform: businesses
    @mcp.tool()
    async def platform_business_create(name: str, owner_name: str, owner_email: str, industry: str = "", city: str = "", plan_id: str = "starter", confirm: bool = False) -> dict:
        """Platform key (support): create a business with its owner on a trial. The owner gets an email to set
        their own password (the AI never sees or sets passwords). Needs confirm=true."""
        body = {"name": name, "industry": industry, "city": city, "owner": {"name": owner_name, "email": owner_email}, "plan_id": plan_id}
        if not confirm:
            return preview("create this business and email its owner an invite", **body)
        return await call("POST", "/v1/platform/businesses", json_body=body)

    @mcp.tool()
    async def platform_business_update(account_id: str, name: str | None = None, industry: str | None = None, city: str | None = None) -> dict:
        """Platform key (support): change a business's name, industry or city."""
        body = {k: v for k, v in {"name": name, "industry": industry, "city": city}.items() if v is not None}
        return await call("PATCH", f"/v1/platform/businesses/{account_id}", json_body=body)

    @mcp.tool()
    async def platform_business_set_plan(account_id: str, plan_id: str, confirm: bool = False) -> dict:
        """Platform key (support): move a business to another plan (starter, growth, pro). Needs confirm=true."""
        if not confirm:
            b = await call("GET", f"/v1/platform/businesses/{account_id}")
            return preview(f"move this business to the {plan_id} plan", business=b.get("name"), current_plan=b.get("plan"))
        return await call("POST", f"/v1/platform/businesses/{account_id}/subscription", json_body={"plan_id": plan_id})

    @mcp.tool()
    async def platform_business_extend_trial(account_id: str, days: int, confirm: bool = False) -> dict:
        """Platform key (support): add 1 to 90 days to a business's free trial. Needs confirm=true."""
        if not confirm:
            b = await call("GET", f"/v1/platform/businesses/{account_id}")
            return preview(f"extend this trial by {days} days", business=b.get("name"))
        return await call("POST", f"/v1/platform/businesses/{account_id}/subscription", json_body={"extend_trial_days": days})

    @mcp.tool()
    async def platform_business_notes(account_id: str) -> list:
        """Platform key: staff-only notes on a business."""
        return await call("GET", f"/v1/platform/businesses/{account_id}/notes")

    @mcp.tool()
    async def platform_business_note_add(account_id: str, text: str) -> dict:
        """Platform key (support): add a staff-only note to a business (the business never sees it)."""
        return await call("POST", f"/v1/platform/businesses/{account_id}/notes", json_body={"text": text})

    @mcp.tool()
    async def platform_business_team(account_id: str) -> list:
        """Platform key: the people on a business and their roles."""
        return await call("GET", f"/v1/platform/businesses/{account_id}/team")

    @mcp.tool()
    async def platform_business_usage(account_id: str, days: int = 30) -> dict:
        """Platform key: a business's contacts, chats, AI replies, broadcasts and wallet spend over N days."""
        return await call("GET", f"/v1/platform/businesses/{account_id}/usage", params={"days": days})

    # ------------------------------------------------- platform: money
    @mcp.tool()
    async def platform_invoices(account_id: str | None = None, limit: int = 50) -> list:
        """Platform key: GST invoices, newest first, optionally for one business."""
        params: dict[str, Any] = {"limit": limit}
        if account_id:
            params["account_id"] = account_id
        return await call("GET", "/v1/platform/invoices", params=params)

    @mcp.tool()
    async def platform_failed_payments(days: int = 30) -> dict:
        """Platform key: failed and abandoned top-ups, failed Razorpay events and past-due subscriptions."""
        return await call("GET", "/v1/platform/failed-payments", params={"days": days})

    @mcp.tool()
    async def platform_revenue_report(days: int = 30, group: str = "day") -> dict:
        """Platform key (finance): invoiced revenue before and after GST, by day or month and by kind."""
        return await call("GET", "/v1/platform/revenue", params={"days": days, "group": group})

    @mcp.tool()
    async def platform_costs(days: int = 30) -> dict:
        """Platform key: what businesses were charged for messages and AI, and AI tokens by model."""
        return await call("GET", "/v1/platform/costs", params={"days": days})

    @mcp.tool()
    async def platform_low_wallets(below_inr: int = 200) -> list:
        """Platform key: businesses whose wallet is below an amount (₹), lowest first."""
        return await call("GET", "/v1/platform/low-wallets", params={"below_paise": below_inr * 100})

    # ------------------------------------------------- platform: plans and rates
    @mcp.tool()
    async def platform_plans_list() -> list:
        """Platform key: every plan, including hidden ones, with price (paise) and limits."""
        return await call("GET", "/v1/platform/plans")

    @mcp.tool()
    async def platform_plans_update(plan_id: str, name: str | None = None, monthly_inr: int | None = None, seats: int | None = None, contacts: int | None = None, unlimited_contacts: bool | None = None, ai_replies: int | None = None, active: bool | None = None, popular: bool | None = None, confirm: bool = False) -> dict:
        """Platform key (super admin): change a plan's price or limits, hide it (active=false) or mark it popular.
        Current subscribers keep their price until they renew on a new checkout. Needs confirm=true."""
        body = {k: v for k, v in {"name": name, "monthly_paise": monthly_inr * 100 if monthly_inr is not None else None, "seats": seats, "contacts": contacts, "unlimited_contacts": unlimited_contacts, "ai_replies": ai_replies, "active": active, "popular": popular}.items() if v is not None}
        if not confirm:
            current = next((p for p in await call("GET", "/v1/platform/plans") if p["id"] == plan_id), None)
            if not current:
                raise ToolFailure("No such plan")
            return preview("change this plan", plan=plan_id, before={k: current.get(k) for k in body if k in current}, after=body)
        return await call("PATCH", f"/v1/platform/plans/{plan_id}", json_body=body)

    @mcp.tool()
    async def platform_rates_update(marketing: int | None = None, utility: int | None = None, authentication: int | None = None, service: int | None = None, ai: int | None = None, confirm: bool = False) -> dict:
        """Platform key (super admin): change what the wallet charges per message or AI reply, in paise (100 = ₹1).
        Applies to every business from the next charge. Needs confirm=true."""
        body = {k: v for k, v in {"marketing": marketing, "utility": utility, "authentication": authentication, "service": service, "ai": ai}.items() if v is not None}
        if not confirm:
            current = await call("GET", "/v1/platform/rates")
            return preview("change the rate card for every business", before={k: current["rates_paise"][f"charge_{k}"] for k in body}, after=body)
        return await call("PUT", "/v1/platform/rates", json_body=body)

    # ------------------------------------------------- platform: health
    @mcp.tool()
    async def platform_whatsapp_health(hours: int = 24) -> dict:
        """Platform key: every business's WhatsApp connection, failed sends and rejected templates."""
        return await call("GET", "/v1/platform/whatsapp-health", params={"hours": hours})

    @mcp.tool()
    async def platform_whatsapp_issues(hours: int = 24) -> list:
        """Platform key: only businesses with WhatsApp problems, with their top errors."""
        return await call("GET", "/v1/platform/whatsapp-issues", params={"hours": hours})

    @mcp.tool()
    async def platform_ai_usage(days: int = 30) -> dict:
        """Platform key: AI replies and tokens by model, by mode and by business."""
        return await call("GET", "/v1/platform/ai-usage", params={"days": days})

    @mcp.tool()
    async def platform_system_status() -> dict:
        """Platform key: database check, what's configured, and queues (stuck broadcasts, failed webhooks, failed sends)."""
        return await call("GET", "/v1/platform/system-status")

    @mcp.tool()
    async def platform_alerts(include_dismissed: bool = False) -> list:
        """Platform key: things that need attention: low wallets, failed payments, trials ending, WhatsApp problems, system issues, urgent tickets."""
        return await call("GET", "/v1/platform/alerts", params={"include_dismissed": include_dismissed})

    @mcp.tool()
    async def platform_alert_dismiss(alert_id: str) -> dict:
        """Platform key (support): hide an alert from the list."""
        return await call("POST", f"/v1/platform/alerts/{alert_id}/dismiss")

    @mcp.tool()
    async def platform_alert_settings(rules: dict | None = None, low_wallet_below_inr: int | None = None, channels: dict | None = None, digest: bool | None = None) -> dict:
        """Platform key: read the alert rules, or change them by passing values (super admin).
        rules keys: lowWallet, quality, paymentFailed, trialEnding, marketingSpike, systemDown. channels: panel, email, whatsapp."""
        body = {k: v for k, v in {"rules": rules, "low_wallet_below_inr": low_wallet_below_inr, "channels": channels, "digest": digest}.items() if v is not None}
        if not body:
            return await call("GET", "/v1/platform/alert-settings")
        return await call("PUT", "/v1/platform/alert-settings", json_body=body)

    @mcp.tool()
    async def platform_settings_update(meta_fees_billed_to: str, confirm: bool = False) -> dict:
        """Platform key (super admin): who Meta bills for WhatsApp messages: "business" (each business's own card)
        or "autoshift" (AutoShift's credit line; the wallet is then charged per message). Needs confirm=true."""
        if not confirm:
            current = await call("GET", "/v1/platform/settings")
            return preview("change who pays Meta for WhatsApp messages", before=current.get("meta_fees_billed_to"), after=meta_fees_billed_to)
        return await call("PUT", "/v1/platform/settings/meta-fees", json_body={"billed_to": meta_fees_billed_to})

    # ------------------------------------------------- platform: support and announcements
    @mcp.tool()
    async def platform_ticket_get(ticket_number: int) -> dict:
        """Platform key: one support request with every message and staff note."""
        return await call("GET", f"/v1/platform/tickets/{ticket_number}")

    @mcp.tool()
    async def platform_ticket_status(ticket_number: int, status: str | None = None, priority: str | None = None) -> dict:
        """Platform key (support): set a ticket's status (open, pending, closed) or priority (low, normal, high, urgent)."""
        body = {k: v for k, v in {"status": status, "priority": priority}.items() if v is not None}
        return await call("PATCH", f"/v1/platform/tickets/{ticket_number}", json_body=body)

    @mcp.tool()
    async def platform_ticket_assign(ticket_number: int, assignee: str) -> dict:
        """Platform key (support): assign a ticket to a staff member by name."""
        return await call("PATCH", f"/v1/platform/tickets/{ticket_number}", json_body={"assignee": assignee})

    @mcp.tool()
    async def platform_announcements_list() -> list:
        """Platform key: every announcement, including drafts and scheduled ones."""
        return await call("GET", "/v1/platform/announcements")

    @mcp.tool()
    async def platform_announcement_update(announcement_id: str, title: str | None = None, body: str | None = None, kind: str | None = None, audience: str | None = None, draft: bool | None = None, publish_at: str | None = None) -> dict:
        """Platform key (support): edit an announcement, publish it (draft=false) or move it back to drafts."""
        patch = {k: v for k, v in {"title": title, "body": body, "kind": kind, "audience": audience, "draft": draft, "publish_at": publish_at}.items() if v is not None}
        return await call("PATCH", f"/v1/platform/announcements/{announcement_id}", json_body=patch)

    @mcp.tool()
    async def platform_announcement_delete(announcement_id: str, confirm: bool = False) -> dict:
        """Platform key (support): delete an announcement. Needs confirm=true."""
        if not confirm:
            found = next((a for a in await call("GET", "/v1/platform/announcements") if a["id"] == announcement_id), None)
            if not found:
                raise ToolFailure("Announcement not found")
            return preview("delete this announcement", title=found.get("title"))
        return await call("DELETE", f"/v1/platform/announcements/{announcement_id}")

    # ------------------------------------------------- platform: user logins
    @mcp.tool()
    async def platform_users_list(query: str | None = None, account_id: str | None = None, limit: int = 50) -> list:
        """Platform key: people with an AutoShift login, by name or email, optionally for one business."""
        params: dict[str, Any] = {"limit": limit}
        if query:
            params["q"] = query
        if account_id:
            params["account_id"] = account_id
        return await call("GET", "/v1/platform/users", params=params)

    @mcp.tool()
    async def platform_user_get(user_id: str) -> dict:
        """Platform key: one person's business, role, last sign-in, and whether their login is disabled."""
        return await call("GET", f"/v1/platform/users/{user_id}")

    @mcp.tool()
    async def platform_user_invite(account_id: str, name: str, email: str, role: str, confirm: bool = False) -> dict:
        """Platform key (support): add a person to a business as admin, agent or viewer. They get an email to set
        their own password. Never grants AutoShift admin access. Needs confirm=true."""
        if not confirm:
            return preview(f"invite {email} to this business as {role}", account_id=account_id, name=name)
        return await call("POST", "/v1/platform/users/invite", json_body={"account_id": account_id, "name": name, "email": email, "role": role})

    @mcp.tool()
    async def platform_user_set_role(user_id: str, role: str, confirm: bool = False) -> dict:
        """Platform key (support): change a person's role on their business (owner, admin, agent, viewer).
        A business always keeps an owner. Needs confirm=true."""
        if not confirm:
            u = await call("GET", f"/v1/platform/users/{user_id}")
            return preview(f"change this person's role to {role}", user=u.get("email"), business=u.get("business"), current_role=u.get("role"))
        return await call("PATCH", f"/v1/platform/users/{user_id}/role", json_body={"role": role})

    @mcp.tool()
    async def platform_user_disable(user_id: str, reason: str = "", confirm: bool = False) -> dict:
        """Platform key (support): block a person from signing in and revoke their API keys. Data stays. Needs confirm=true."""
        if not confirm:
            u = await call("GET", f"/v1/platform/users/{user_id}")
            return preview("disable this login", user=u.get("email"), business=u.get("business"), reason=reason)
        return await call("POST", f"/v1/platform/users/{user_id}/disable", json_body={"reason": reason})

    @mcp.tool()
    async def platform_user_enable(user_id: str, confirm: bool = False) -> dict:
        """Platform key (support): let a disabled person sign in again. Needs confirm=true."""
        if not confirm:
            u = await call("GET", f"/v1/platform/users/{user_id}")
            return preview("enable this login", user=u.get("email"), business=u.get("business"))
        return await call("POST", f"/v1/platform/users/{user_id}/enable")

    @mcp.tool()
    async def platform_user_send_reset(user_id: str, confirm: bool = False) -> dict:
        """Platform key (support): email the person a password-reset link. The link goes only to their inbox. Needs confirm=true."""
        if not confirm:
            u = await call("GET", f"/v1/platform/users/{user_id}")
            return preview("email a password-reset link", to=u.get("email"))
        return await call("POST", f"/v1/platform/users/{user_id}/send-reset")

    @mcp.tool()
    async def platform_user_remove(user_id: str, reason: str = "", confirm: bool = False) -> dict:
        """Platform key (super admin): remove a login for good. Wipes their name and email, takes them off their business,
        locks the login and revokes keys; business data, invoices and the wallet ledger are kept.
        A business's only owner can't be removed. Can't be undone. Needs confirm=true."""
        if not confirm:
            u = await call("GET", f"/v1/platform/users/{user_id}")
            return preview("remove this login for good (business data and money records are kept)", user=u.get("email"), business=u.get("business"), role=u.get("role"))
        return await call("POST", f"/v1/platform/users/{user_id}/remove", json_body={"reason": reason})

    return mcp


def mount_mcp(app: FastAPI) -> MCPServer:
    mcp = build_mcp(lambda: app)
    security = TransportSecuritySettings(enable_dns_rebinding_protection=True, allowed_hosts=get_settings().mcp_hosts, allowed_origins=[])
    sub = mcp.streamable_http_app(streamable_http_path="/", stateless_http=True, json_response=True, transport_security=security)
    app.mount("/mcp", AuthCapture(sub))
    return mcp
