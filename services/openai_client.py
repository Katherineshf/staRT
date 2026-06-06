"""Shared OpenAI client — gpt-4o chat (JSON mode) + embeddings.

Both helpers are Weave ops, so every LLM/embedding call shows up as a nested
child span underneath whichever agent op invoked it.
"""

from __future__ import annotations

import json
import os

from openai import AsyncOpenAI

from services.weave_tracing import weave_op

CHAT_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")
EMBED_MODEL = os.getenv("OPENAI_EMBED_MODEL", "text-embedding-3-small")

_client: AsyncOpenAI | None = None


def get_client() -> AsyncOpenAI:
    """Lazily create the AsyncOpenAI client (after dotenv has loaded the key)."""
    global _client
    if _client is None:
        _client = AsyncOpenAI()
    return _client


@weave_op("openai_chat_json")
async def chat_json(
    system: str,
    user: str,
    *,
    model: str | None = None,
    temperature: float = 0.4,
) -> dict:
    """Call gpt-4o in JSON mode and return the parsed object.

    The prompt must mention "json" somewhere (OpenAI requirement for json_object).
    Models always return a JSON *object*, so wrap arrays under a key, e.g. {"plans": [...]}.
    """
    resp = await get_client().chat.completions.create(
        model=model or CHAT_MODEL,
        temperature=temperature,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    return json.loads(resp.choices[0].message.content or "{}")


@weave_op("openai_embed")
async def embed_text(text: str, *, model: str | None = None) -> list[float]:
    """Embed a string with text-embedding-3-small (1536 dims)."""
    resp = await get_client().embeddings.create(model=model or EMBED_MODEL, input=text)
    return resp.data[0].embedding
