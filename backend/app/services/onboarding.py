"""WhatsApp Embedded Signup completion: code exchange -> ownership check -> store -> subscribe ->
register -> fetch number status. Each step records its outcome so a retry resumes where it failed.
"""

import logging
from dataclasses import dataclass
from uuid import UUID

from app.models import ConnectionStatus, OnboardingType, WhatsAppAccount, utcnow
from app.repositories.base import Repository
from app.services.crypto import SecretBox, generate_pin
from app.services.meta_graph import MetaGraphClient, MetaGraphError

logger = logging.getLogger(__name__)

WABA_MANAGEMENT_SCOPE = "whatsapp_business_management"


class OnboardingError(Exception):
    """A failure before anything was stored; the client should restart the signup."""

    def __init__(self, message: str, *, status_code: int = 400, step: str) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.step = step


@dataclass
class OnboardingService:
    repo: Repository
    graph: MetaGraphClient
    box: SecretBox
    app_id: str

    async def complete_signup(
        self,
        *,
        tenant_id: UUID,
        code: str,
        waba_id: str,
        phone_number_id: str,
        onboarding_type: OnboardingType,
    ) -> WhatsAppAccount:
        # 1. The code is single-use and short-lived, so exchange it before anything else.
        try:
            token = await self.graph.exchange_code(code)
        except MetaGraphError as exc:
            raise OnboardingError(
                f"Could not exchange the signup code: {exc.message}",
                status_code=502,
                step="exchange",
            ) from exc

        # 2. The message-event IDs come from the browser; trust them only if the token covers them.
        await self._verify_ownership(token, waba_id)
        phone = await self._find_phone_number(token, waba_id, phone_number_id)

        # 3. Persist (one WhatsApp account per tenant; reconnecting replaces the previous one).
        account = await self.repo.get_account_by_tenant(tenant_id)
        if account is None:
            account = WhatsAppAccount(
                tenant_id=tenant_id, waba_id=waba_id, phone_number_id=phone_number_id
            )
        elif account.waba_id != waba_id or account.phone_number_id != phone_number_id:
            account.webhooks_subscribed = False
            account.phone_registered = False
            account.pin_ciphertext = None
        account.waba_id = waba_id
        account.phone_number_id = phone_number_id
        account.onboarding_type = onboarding_type
        account.token_ciphertext = self.box.encrypt(token)
        account.connection_status = ConnectionStatus.PENDING
        account.last_error = None
        account.apply_phone_details(phone)
        account = await self.repo.save_account(account)
        logger.info("Stored WhatsApp account tenant=%s waba=%s", tenant_id, waba_id)

        return await self._finish(account, token)

    async def retry(self, account: WhatsAppAccount) -> WhatsAppAccount:
        token = self._token(account)
        account.last_error = None
        return await self._finish(account, token)

    async def refresh(self, account: WhatsAppAccount) -> WhatsAppAccount:
        token = self._token(account)
        try:
            account.apply_phone_details(
                await self.graph.get_phone_number(account.phone_number_id, token)
            )
        except MetaGraphError as exc:
            account.last_error = {"step": "refresh", **exc.as_dict()}
        return await self.repo.save_account(account)

    async def disconnect(self, account: WhatsAppAccount) -> WhatsAppAccount:
        if account.token_ciphertext and account.webhooks_subscribed:
            try:
                await self.graph.unsubscribe_app(account.waba_id, self._token(account))
            except MetaGraphError as exc:
                # Business may have removed us in Business Manager; forget the token anyway.
                logger.warning("Unsubscribe failed for waba=%s: %s", account.waba_id, exc.message)
        account.connection_status = ConnectionStatus.DISCONNECTED
        account.webhooks_subscribed = False
        account.token_ciphertext = None
        account.pin_ciphertext = None
        account.last_error = None
        return await self.repo.save_account(account)

    def _token(self, account: WhatsAppAccount) -> str:
        if not account.token_ciphertext:
            raise OnboardingError(
                "No business token is stored; reconnect WhatsApp", status_code=409, step="token"
            )
        return self.box.decrypt(account.token_ciphertext)

    async def _verify_ownership(self, token: str, waba_id: str) -> None:
        try:
            info = await self.graph.debug_token(token)
        except MetaGraphError as exc:
            raise OnboardingError(
                f"Could not verify the business token: {exc.message}",
                status_code=502,
                step="verify",
            ) from exc
        if not info.is_valid or info.app_id != self.app_id:
            raise OnboardingError("The token was not issued to this app", step="verify")
        targets = info.granular_scopes.get(WABA_MANAGEMENT_SCOPE)
        if targets is None or waba_id not in targets:
            raise OnboardingError(
                "The connected business did not grant access to this WhatsApp Business Account",
                status_code=403,
                step="verify",
            )

    async def _find_phone_number(self, token: str, waba_id: str, phone_number_id: str) -> dict:
        try:
            numbers = await self.graph.list_phone_numbers(waba_id, token)
        except MetaGraphError as exc:
            raise OnboardingError(
                f"Could not read the account's phone numbers: {exc.message}",
                status_code=502,
                step="verify",
            ) from exc
        for number in numbers:
            if str(number.get("id")) == phone_number_id:
                return number
        raise OnboardingError(
            "That phone number does not belong to the connected WhatsApp Business Account",
            status_code=403,
            step="verify",
        )

    async def _finish(self, account: WhatsAppAccount, token: str) -> WhatsAppAccount:
        if not account.webhooks_subscribed:
            try:
                await self.graph.subscribe_app(account.waba_id, token)
                account.webhooks_subscribed = True
            except MetaGraphError as exc:
                return await self._fail(
                    account, ConnectionStatus.SUBSCRIBE_FAILED, "subscribe", exc
                )

        if account.onboarding_type is OnboardingType.COEXISTENCE:
            account.phone_registered = True  # already live on the WhatsApp Business app
        elif not account.phone_registered:
            if not account.pin_ciphertext:
                account.pin_ciphertext = self.box.encrypt(generate_pin())
            try:
                await self.graph.register_phone_number(
                    account.phone_number_id, token, self.box.decrypt(account.pin_ciphertext)
                )
                account.phone_registered = True
            except MetaGraphError as exc:
                return await self._fail(
                    account, ConnectionStatus.REGISTRATION_FAILED, "register", exc
                )

        try:
            account.apply_phone_details(
                await self.graph.get_phone_number(account.phone_number_id, token)
            )
        except MetaGraphError as exc:
            # Connected regardless; the settings page can refresh later.
            logger.warning("Status fetch failed for phone=%s: %s", account.phone_number_id, exc)

        account.connection_status = ConnectionStatus.CONNECTED
        account.connected_at = account.connected_at or utcnow()
        account.last_error = None
        return await self.repo.save_account(account)

    async def _fail(
        self, account: WhatsAppAccount, status: ConnectionStatus, step: str, exc: MetaGraphError
    ) -> WhatsAppAccount:
        logger.warning("Onboarding step %s failed for waba=%s: %s", step, account.waba_id, exc)
        account.connection_status = status
        account.last_error = {"step": step, **exc.as_dict()}
        return await self.repo.save_account(account)
