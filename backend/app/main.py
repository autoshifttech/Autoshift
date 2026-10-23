import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings, get_settings
from app.repositories.base import Repository
from app.repositories.memory import MemoryRepository
from app.routers import contact, tenants, webhooks, whatsapp
from app.services.meta_graph import MetaGraphClient


async def build_repository(settings: Settings) -> Repository:
    if settings.repository_backend == "memory":
        if settings.environment == "production":
            raise RuntimeError("REPOSITORY_BACKEND=memory is not allowed in production")
        return MemoryRepository()
    if settings.database_url is None:
        raise RuntimeError("DATABASE_URL is required when REPOSITORY_BACKEND=postgres")
    from app.repositories.postgres import PostgresRepository

    return await PostgresRepository.connect(settings.database_url.get_secret_value())


def create_app(settings: Settings | None = None, repo: Repository | None = None) -> FastAPI:
    settings = settings or get_settings()
    logging.basicConfig(level=settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        http = httpx.AsyncClient()
        app.state.graph = MetaGraphClient(
            http,
            graph_url=settings.graph_url,
            app_id=settings.meta_app_id,
            app_secret=settings.meta_app_secret.get_secret_value(),
        )
        app.state.repo = repo or await build_repository(settings)
        try:
            yield
        finally:
            await app.state.repo.close()
            await http.aclose()

    app = FastAPI(
        title="Autoshift API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url=None if settings.environment == "production" else "/docs",
        redoc_url=None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-Tenant-Id"],
    )
    app.include_router(tenants.router)
    app.include_router(whatsapp.router)
    app.include_router(webhooks.router)
    app.include_router(contact.router)

    @app.get("/healthz", tags=["meta"])
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    return app
