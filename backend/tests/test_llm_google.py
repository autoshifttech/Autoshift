import json

import httpx
import pytest

from app import llm as llm_mod


@pytest.mark.asyncio
async def test_gemini_asks_for_short_thinking_and_retries_without_it(monkeypatch):
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        seen.append(body)
        if "generationConfig" in body and len(seen) == 1 and "3.5" in str(request.url):
            return httpx.Response(400, json={"error": {"message": "thinking not supported"}})
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": "Hello!"}]}}], "usageMetadata": {"promptTokenCount": 5, "candidatesTokenCount": 2}})

    real = httpx.AsyncClient
    monkeypatch.setattr(llm_mod.httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    out = await llm_mod.HttpLlm().complete("google", "k", "gemini-3.6-flash", "sys", [{"role": "user", "content": "Hi"}])
    assert out.text == "Hello!" and seen[0]["generationConfig"]["thinkingConfig"] == {"thinkingLevel": "low"}

    seen.clear()
    out = await llm_mod.HttpLlm().complete("google", "k", "gemini-3.5-flash", "sys", [{"role": "user", "content": "Hi"}])
    assert out.text == "Hello!" and len(seen) == 2 and "generationConfig" not in seen[1]
