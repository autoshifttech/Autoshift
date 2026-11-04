from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .mcp_server import mount_mcp
from .routers import ai_models, assistants, businesses, connections, keys, me, plans, platform, platform_money, reports, wallet, webhooks


def create_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(_: FastAPI):
        async with mcp.session_manager.run():
            yield

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

    for r in (me.router, reports.router, businesses.router, assistants.router, connections.router, ai_models.router, platform.router, platform_money.router, keys.router, wallet.router, plans.router, webhooks.router):
        app.include_router(r)

    mcp = mount_mcp(app)
    return app


app = create_app()
