"""AI providers and models: set up by platform admins, picked by businesses."""

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from .. import audit
from ..config import Settings, get_settings
from ..deps import Member, PlatformAdmin, ServiceDb, get_platform_admin, require_platform_role
from ..schemas import ModelCreate, ModelUpdate, ProviderUpdate, Vendor
from ..security import encrypt

router = APIRouter(tags=["ai-models"])
SuperOrFinance = Annotated[PlatformAdmin, Depends(require_platform_role("finance"))]


@router.get("/v1/ai-models/available")
async def available(ctx: Member, sdb: ServiceDb):
    """What a business can pick from: switched-on providers and models, no keys."""
    providers = {p["vendor"] for p in await sdb.select("platform_ai_providers", {"enabled": "true"})}
    models = await sdb.select("platform_ai_models", {"enabled": "true"})
    return [
        {"vendor": m["vendor"], "model_id": m["model_id"], "label": m["label"], "tier": m["tier"], "is_default": m["is_default"]}
        for m in models
        if m["vendor"] in providers
    ]


@router.get("/v1/platform/ai-models")
async def overview(_: Annotated[PlatformAdmin, Depends(get_platform_admin)], sdb: ServiceDb):
    """Everything the admin screen shows. Only the last four characters of a key."""
    providers = await sdb.select("platform_ai_providers")
    models = await sdb.select("platform_ai_models")
    return {
        "providers": [{"vendor": p["vendor"], "enabled": p["enabled"], "key_tail": p["key_tail"], "saved_at": p["saved_at"]} for p in providers],
        "models": models,
    }


@router.put("/v1/platform/ai-providers/{vendor}")
async def update_provider(vendor: Vendor, body: ProviderUpdate, admin: SuperOrFinance, sdb: ServiceDb, settings: Annotated[Settings, Depends(get_settings)]):
    rows = await sdb.select("platform_ai_providers", {"vendor": vendor}, limit=1)
    if not rows:
        raise HTTPException(404, "Unknown provider")
    current = rows[0]
    patch: dict = {}
    if body.api_key:
        patch.update(key_ciphertext=encrypt(body.api_key.strip(), settings), key_tail=body.api_key.strip()[-4:], saved_at=datetime.now(timezone.utc).isoformat())
    if body.enabled is not None:
        if body.enabled and not (current["key_ciphertext"] or body.api_key):
            raise HTTPException(422, "Save an API key first")
        patch["enabled"] = body.enabled
    if not patch:
        raise HTTPException(422, "Nothing to change")
    updated = (await sdb.update("platform_ai_providers", {"vendor": vendor}, patch))[0]
    await audit.record(sdb, scope="platform", action="ai_provider.update", actor_id=admin.user.id, target=vendor, details={"fields": sorted(k for k in patch if not k.startswith("key_c"))})
    return {"vendor": vendor, "enabled": updated["enabled"], "key_tail": updated["key_tail"], "saved_at": updated["saved_at"]}


@router.post("/v1/platform/ai-providers/{vendor}/models", status_code=201)
async def add_model(vendor: Vendor, body: ModelCreate, admin: SuperOrFinance, sdb: ServiceDb):
    if await sdb.select("platform_ai_models", {"vendor": vendor, "model_id": body.model_id}, limit=1):
        raise HTTPException(409, "That model is already listed")
    row = await sdb.insert("platform_ai_models", {"vendor": vendor, "model_id": body.model_id, "label": body.label or body.model_id, "tier": body.tier, "is_custom": True})
    await audit.record(sdb, scope="platform", action="ai_model.add", actor_id=admin.user.id, target=f"{vendor}/{body.model_id}")
    return row


@router.patch("/v1/platform/ai-providers/{vendor}/models/{model_id}")
async def update_model(vendor: Vendor, model_id: str, body: ModelUpdate, admin: SuperOrFinance, sdb: ServiceDb):
    rows = await sdb.select("platform_ai_models", {"vendor": vendor, "model_id": model_id}, limit=1)
    if not rows:
        raise HTTPException(404, "Model not found")
    model = rows[0]
    patch: dict = {}
    if body.enabled is not None:
        if not body.enabled and model["is_default"]:
            raise HTTPException(422, "Pick another default first")
        patch["enabled"] = body.enabled
    if body.is_default:
        # One default across the platform: clear the old one, then set this one (and switch it on).
        for old in await sdb.select("platform_ai_models", {"is_default": "true"}):
            await sdb.update("platform_ai_models", {"vendor": old["vendor"], "model_id": old["model_id"]}, {"is_default": False})
        patch.update(is_default=True, enabled=True)
    if not patch:
        raise HTTPException(422, "Nothing to change")
    updated = (await sdb.update("platform_ai_models", {"vendor": vendor, "model_id": model_id}, patch))[0]
    await audit.record(sdb, scope="platform", action="ai_model.update", actor_id=admin.user.id, target=f"{vendor}/{model_id}", details=patch)
    return updated
