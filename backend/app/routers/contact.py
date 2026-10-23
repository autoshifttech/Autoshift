from typing import Annotated

from fastapi import APIRouter, Depends, Request, status

from app.deps import get_repo, limiter
from app.models import ContactRequest
from app.repositories.base import Repository
from app.schemas import ContactIn

router = APIRouter(prefix="/api/contact", tags=["contact"])


@router.post("", status_code=status.HTTP_202_ACCEPTED)
async def submit_contact(
    body: ContactIn,
    request: Request,
    repo: Annotated[Repository, Depends(get_repo)],
) -> dict[str, str]:
    client = request.client.host if request.client else "unknown"
    limiter.check(f"contact:{client}", limit=5)
    if not body.website:  # honeypot filled -> silently drop spam
        await repo.insert_contact_request(
            ContactRequest(
                name=body.name.strip(),
                email=str(body.email),
                company=body.company.strip() if body.company else None,
                topic=body.topic,
                message=body.message.strip(),
            )
        )
    return {"status": "received"}
