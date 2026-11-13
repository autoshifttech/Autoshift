import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .mcp_server import mount_mcp
from .routers import internal, support, tools, team, billing_details, hooks, ai_models, assistants, businesses, connections, keys, me, plans, platform, platform_money, reports, wallet, webhooks, workspace_ops


def create_app() -> FastAPI:
    async def webhook_loop():
        from . import events
        from .db import service_db

        from . import closing
        from .razorpay import RazorpayClient

        settings = get_settings()
        sdb = service_db(settings)
        tick = 0
        while True:
            try:
                await events.deliver_pending(sdb, settings)
            except Exception:  # noqa: BLE001 - keep the loop alive
                logging.getLogger("autoshift").exception("webhook delivery pass failed")
            if tick % 120 == 0:  # about once an hour: close businesses whose grace period has ended
                try:
                    await closing.close_due(sdb, RazorpayClient(settings))
                except Exception:  # noqa: BLE001
                    logging.getLogger("autoshift").exception("closing pass failed")
            tick += 1
            await asyncio.sleep(30)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        worker = asyncio.create_task(webhook_loop()) if get_settings().webhook_worker else None
        try:
            async with mcp.session_manager.run():
                yield
        finally:
            if worker:
                worker.cancel()

    app = FastAPI(title="AutoShift API", version="0.2.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=get_settings().cors_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.get("/health", tags=["health"])
    def health():
        return {"status": "ok"}

    for r in (me.router, internal.router, support.router, tools.router, team.router, billing_details.router, hooks.router, reports.router, businesses.router, assistants.router, connections.router, ai_models.router, platform.router, platform_money.router, keys.router, wallet.router, plans.router, webhooks.router, workspace_ops.router):
        app.include_router(r)

    mcp = mount_mcp(app)
    return app


app = create_app()
