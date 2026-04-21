"""Optional Google Gemini–powered suggestions and chat."""

from __future__ import annotations

import json
import os
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Any

# Always load backend/.env when this module is used (works even if import order changes)
try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)
except ImportError:
    pass

os.environ.pop("OPENAI_API_KEY", None)

try:
    import google.generativeai as genai
except ImportError:  # pragma: no cover
    genai = None  # type: ignore

DEFAULT_MODEL = "gemini-1.5-flash"
FALLBACK_CHAIN: tuple[str, ...] = (
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
    "gemini-2.0-flash",
    "gemini-1.5-pro",
)

# Returned by ``stop_when`` to try the next generation config / model.
GENERATION_CONTINUE = object()


def _api_key() -> str:
    return (
        os.getenv("GEMINI_API_KEY")
        or os.getenv("GOOGLE_API_KEY")
        or ""
    ).strip()


def _model_sequence() -> list[str]:
    """Primary from env (default gemini-1.5-flash), then fallback chain, deduped."""
    primary = (os.getenv("GEMINI_MODEL") or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    extra = os.getenv("GEMINI_MODEL_FALLBACK", "").strip()
    tail: list[str] = list(FALLBACK_CHAIN)
    if extra:
        tail = [x.strip() for x in extra.split(",") if x.strip()] + tail
    seen: set[str] = set()
    out: list[str] = []
    for m in [primary, *tail]:
        if m and m not in seen:
            seen.add(m)
            out.append(m)
    return out


def _is_retryable_quota_error(exc: BaseException) -> bool:
    s = str(exc).lower()
    t = type(exc).__name__.lower()
    if "resourceexhausted" in t or "429" in s:
        return True
    if "quota" in s:
        return True
    if "rate" in s and "limit" in s:
        return True
    return False


def _friendly_gemini_error(exc: BaseException) -> str:
    """User-facing message; no raw stack traces."""
    s = str(exc).strip()
    low = s.lower()
    if "429" in s or "quota" in low or "resource exhausted" in low:
        return (
            "Google Gemini quota was reached for the models we tried (common on the free tier). "
            "Try again in a few minutes, enable billing in Google AI Studio, or set "
            f"{DEFAULT_MODEL!r} in GEMINI_MODEL inside backend/.env and restart the server. "
            "See: https://ai.google.dev/gemini-api/docs/rate-limits"
        )
    if "api key" in low or ("invalid" in low and "key" in low):
        return (
            "Gemini rejected the API key. Check GEMINI_API_KEY in backend/.env "
            "from https://aistudio.google.com/apikey — then restart uvicorn."
        )
    if "empty" in low and "reply" in low:
        return (
            "Gemini returned no text. Try a shorter question, or try again in a moment."
        )
    return f"Gemini could not complete the request: {s[:280]}{'…' if len(s) > 280 else ''}"


def _extract_response_text(resp: Any) -> str:
    """Extract text safely from a Gemini response."""
    try:
        t = getattr(resp, "text", None)
        if t:
            return str(t).strip()
    except Exception:
        pass
    try:
        if resp.candidates:
            parts = resp.candidates[0].content.parts
            return "".join(getattr(p, "text", "") for p in parts).strip()
    except Exception:
        pass
    return ""


def generate_content_gemini(
    *,
    user_prompt: str,
    system_instruction: str | None,
    generation_configs: Sequence[Any],
    stop_when: Callable[[str], Any] | None = None,
) -> tuple[bool, Any, str | None, str | None]:
    """
    Single entry point for Gemini: model fallback + one or more generation configs per model.

    ``stop_when(text)`` returns ``GENERATION_CONTINUE`` to try the next config/model,
    or any other value to treat as success and return (True, value, None, model_name).
    If ``stop_when`` is None, first non-empty text is success.

    Returns:
        (success, payload, user_error_message, model_used)
        On success: user_error_message is None; payload is str (chat) or dict (suggest).
    """
    def _default_stop(text: str) -> Any:
        t = text.strip()
        return t if t else GENERATION_CONTINUE

    predicate = stop_when or _default_stop

    if genai is None:
        return False, None, "Google Generative AI package missing. Run: pip install google-generativeai", None

    api_key = _api_key()
    if not api_key:
        return (
            False,
            None,
            (
                "No Gemini API key. Add GEMINI_API_KEY (or GOOGLE_API_KEY) to backend/.env "
                "from https://aistudio.google.com/apikey — then restart uvicorn."
            ),
            None,
        )

    genai.configure(api_key=api_key)
    last_error: BaseException | None = None

    for model_name in _model_sequence():
        model = genai.GenerativeModel(
            model_name,
            system_instruction=system_instruction,
        )
        for gen_cfg in generation_configs:
            try:
                resp = model.generate_content(
                    user_prompt,
                    generation_config=gen_cfg,
                )
                text = _extract_response_text(resp)
                if not text:
                    last_error = RuntimeError("empty response from Gemini")
                    continue

                result = predicate(text)
                if result is GENERATION_CONTINUE:
                    continue
                return True, result, None, model_name

            except Exception as e:
                last_error = e
                if _is_retryable_quota_error(e):
                    break  # next model
                return False, None, _friendly_gemini_error(e), None

    return False, None, _friendly_gemini_error(last_error or Exception("unknown")), None


def _parse_suggestion_json(text: str) -> dict[str, Any] | None:
    if not text:
        return None
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    try:
        data = json.loads(t)
        return {
            "problem_type": str(data.get("problem_type", "")),
            "target_audience": str(data.get("target_audience", "")),
            "startup_idea": str(data.get("startup_idea", "")),
        }
    except Exception:
        return None


def suggest_from_description(description: str) -> dict[str, Any] | None:
    """
    Returns structured suggestion or None if API not configured / fails.
    """
    if not _api_key() or genai is None:
        return None

    sys_inst = (
        "You help founders analyze problems. Reply with valid JSON only, no markdown."
    )
    user_prompt = (
        "Given this real-world problem description, respond with a compact JSON object only, "
        'keys: problem_type (string), target_audience (string), startup_idea (string). '
        "No markdown, no extra text.\n\nProblem:\n"
        f"{description.strip()}"
    )

    json_cfg = genai.GenerationConfig(
        temperature=0.4,
        response_mime_type="application/json",
    )
    plain_cfg = genai.GenerationConfig(temperature=0.4)

    def _accept_suggestion(text: str) -> Any:
        parsed = _parse_suggestion_json(text)
        return parsed if parsed is not None else GENERATION_CONTINUE

    ok, payload, _err, _model = generate_content_gemini(
        user_prompt=user_prompt,
        system_instruction=sys_inst,
        generation_configs=(json_cfg, plain_cfg),
        stop_when=_accept_suggestion,
    )
    if ok and isinstance(payload, dict):
        return payload
    return None


def chat_assist(message: str, context: str | None = None) -> dict[str, Any]:
    """
    Conversational reply for dashboard chat.

    Returns:
        {"ok": True, "reply": str, "message": None} on success
        {"ok": False, "reply": None, "message": str} on failure
    """
    if genai is None:
        return {
            "ok": False,
            "reply": None,
            "message": "Google Generative AI package missing. Run: pip install google-generativeai",
        }

    system = (
        "You are The Curator, a helpful assistant for the AI Startup Problem Solver dashboard. "
        "Users see clustered real-world problems, categories, and startup ideas. "
        "Answer clearly in short paragraphs. No markdown code blocks unless asked. "
        "If asked for startup ideas, give one concrete angle. If context is provided, use it."
    )
    user_content = message.strip()
    if context and context.strip():
        user_content = (
            f"Context (current screen / data):\n{context.strip()}\n\nUser question:\n{message.strip()}"
        )

    chat_cfg = genai.GenerationConfig(
        temperature=0.55,
        max_output_tokens=900,
    )

    ok, payload, err, _model = generate_content_gemini(
        user_prompt=user_content,
        system_instruction=system,
        generation_configs=(chat_cfg,),
    )
    if ok and isinstance(payload, str):
        return {"ok": True, "reply": payload, "message": None}
    return {"ok": False, "reply": None, "message": err or "Gemini returned no reply."}
