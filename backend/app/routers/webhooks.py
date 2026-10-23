import json
import logging
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from fastapi.responses import PlainTextResponse

from app.config import Settings, get_settings
from app.deps import get_repo
from app.repositories.base import Repository
from app.services.webhooks import WebhookProcessor, verify_signature

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.get("/whatsapp", response_class=PlainTextResponse)
async def verify_webhook(
    settings: Annotated[Settings, Depends(get_settings)],
    mode: Annotated[str | None, Query(alias="hub.mode")] = None,
    verify_token: Annotated[str | None, Query(alias="hub.verify_token")] = None,
    challenge: Annotated[str | None, Query(alias="hub.challenge")] = None,
) -> str:
    expected = settings.whatsapp_webhook_verify_token.get_secret_value()
    if mode == "subscribe" and verify_token == expected and challenge is not None:
        return challenge
    raise HTTPException(status.HTTP_403_FORBIDDEN, "Webhook verification failed")


@router.post("/whatsapp")
async def receive_webhook(
    request: Request,
    background: BackgroundTasks,
    settings: Annotated[Settings, Depends(get_settings)],
    repo: Annotated[Repository, Depends(get_repo)],
) -> dict[str, str]:
    body = await request.body()
    if not verify_signature(
        settings.meta_app_secret.get_secret_value(),
        body,
        request.headers.get("x-hub-signature-256"),
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid signature")
    try:
        payload = json.loads(body)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Body must be JSON") from exc

    processor = WebhookProcessor(repo)
    work = await processor.record(payload)
    # Acknowledge immediately; Meta retries deliveries that are slow or fail.
    background.add_task(processor.process, work)
    return {"status": "received"}
