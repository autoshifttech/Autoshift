from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import ai_models, assistants, connections, me, plans, platform, platform_money, wallet, webhooks

app = FastAPI(title="AutoShift API", version="0.1.0")

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


for r in (me.router, assistants.router, connections.router, ai_models.router, platform.router, platform_money.router, wallet.router, plans.router, webhooks.router):
    app.include_router(r)
