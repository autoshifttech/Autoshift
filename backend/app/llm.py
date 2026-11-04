"""Calls to AI providers. One small interface so the runner can be tested without a network."""

from dataclasses import dataclass
from typing import Protocol

import httpx

OPENAI_STYLE = {
    "openai": "https://api.openai.com/v1/chat/completions",
    "deepseek": "https://api.deepseek.com/chat/completions",
    "deepinfra": "https://api.deepinfra.com/v1/openai/chat/completions",
}


class LlmError(Exception):
    pass


@dataclass(frozen=True)
class LlmResult:
    text: str
    tokens_in: int = 0
    tokens_out: int = 0


class Llm(Protocol):
    async def complete(self, vendor: str, api_key: str, model: str, system: str, messages: list[dict]) -> LlmResult: ...


class HttpLlm:
    """messages: [{"role": "user"|"assistant", "content": str}]"""

    async def complete(self, vendor, api_key, model, system, messages):
        async with httpx.AsyncClient(timeout=45) as client:
            try:
                if vendor in OPENAI_STYLE:
                    res = await client.post(OPENAI_STYLE[vendor], headers={"Authorization": f"Bearer {api_key}"}, json={"model": model, "messages": [{"role": "system", "content": system}, *messages]})
                    data = self._ok(res)
                    usage = data.get("usage") or {}
                    return LlmResult(data["choices"][0]["message"]["content"] or "", usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0))
                if vendor == "anthropic":
                    res = await client.post("https://api.anthropic.com/v1/messages", headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"}, json={"model": model, "max_tokens": 600, "system": system, "messages": messages})
                    data = self._ok(res)
                    usage = data.get("usage") or {}
                    return LlmResult("".join(b.get("text", "") for b in data["content"]), usage.get("input_tokens", 0), usage.get("output_tokens", 0))
                if vendor == "google":
                    contents = [{"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]} for m in messages]
                    res = await client.post(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent", headers={"x-goog-api-key": api_key}, json={"systemInstruction": {"parts": [{"text": system}]}, "contents": contents})
                    data = self._ok(res)
                    usage = data.get("usageMetadata") or {}
                    parts = data["candidates"][0]["content"]["parts"]
                    return LlmResult("".join(p.get("text", "") for p in parts), usage.get("promptTokenCount", 0), usage.get("candidatesTokenCount", 0))
            except httpx.HTTPError as exc:
                raise LlmError(f"Could not reach {vendor}") from exc
            except (KeyError, IndexError, TypeError) as exc:
                raise LlmError(f"{vendor} sent an unexpected answer") from exc
        raise LlmError(f"Unknown provider {vendor}")

    @staticmethod
    def _ok(res: httpx.Response) -> dict:
        if res.status_code >= 400:
            raise LlmError(f"The provider refused the request ({res.status_code})")
        return res.json()
