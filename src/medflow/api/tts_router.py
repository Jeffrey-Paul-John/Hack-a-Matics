"""FastAPI router for Sarvam Text-to-Speech endpoints."""
from __future__ import annotations
from datetime import datetime, timezone
import logging
import time
import uuid
from typing import Optional
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from ..services.tts_service import (
    ALLOWED_LANGUAGES,
    ALLOWED_VOICES,
    DEFAULT_VOICE,
    MAX_TEXT_LENGTH,
    is_voice_enabled,
    synthesize_speech,
)

logger = logging.getLogger("medflow.tts.router")

router = APIRouter(prefix="/tts", tags=["Voice & TTS"])

# Bounded in-memory store for recent chat replies (1 hour TTL, max 500 entries)
# msg_id -> (reply_text, session_id, timestamp)
_REPLY_STORE: dict[str, tuple[str, str, float]] = {}
MAX_REPLY_STORE_ENTRIES = 500
REPLY_TTL_SECONDS = 3600

def _extract_request_session(request: Request) -> str:
    if not request:
        return "default"
    sid = request.headers.get("X-Session-ID") or request.query_params.get("session_id")
    return sid.strip() if sid and sid.strip() else "default"

def store_chat_reply(reply_text: str, session_id: str = "default") -> str:
    """Store generated bot reply for speech synthesis lookup bound to a session."""
    now = time.time()
    # Evict expired or overflow entries
    if len(_REPLY_STORE) >= MAX_REPLY_STORE_ENTRIES:
        cutoff = now - REPLY_TTL_SECONDS
        expired = [k for k, (_, _, ts) in _REPLY_STORE.items() if ts < cutoff]
        for k in expired:
            _REPLY_STORE.pop(k, None)
        if len(_REPLY_STORE) >= MAX_REPLY_STORE_ENTRIES:
            oldest_key = min(_REPLY_STORE.keys(), key=lambda k: _REPLY_STORE[k][2])
            _REPLY_STORE.pop(oldest_key, None)

    msg_id = f"msg_{uuid.uuid4().hex}"
    _REPLY_STORE[msg_id] = (reply_text, session_id, now)
    return msg_id

def get_chat_reply(msg_id: str, session_id: str = "default") -> Optional[str]:
    """Retrieve chat reply by ID if present, unexpired, and matching session."""
    entry = _REPLY_STORE.get(msg_id)
    if not entry:
        return None
    text, entry_session, ts = entry
    if time.time() - ts > REPLY_TTL_SECONDS:
        _REPLY_STORE.pop(msg_id, None)
        return None
    if entry_session != session_id:
        return None
    return text

class SpeakRequest(BaseModel):
    text: Optional[str] = Field(default=None, description="Text string to synthesize")
    message_id: Optional[str] = Field(default=None, description="Server-verified chat message ID")
    voice: str = Field(default="shubh", description="Voice identifier ('shubh' | 'simran')")
    language_code: str = Field(default="en-IN", description="BCP-47 language code")
    pace: float = Field(default=1.0, description="Speech rate multiplier (clamped to 0.5 to 2.0)")

@router.get("/config")
def get_tts_config():
    """Return voice service availability and allowed speaker options."""
    enabled = is_voice_enabled()
    return {
        "enabled": enabled,
        "voices": [
            {"id": "shubh", "label": "Shubh (Male)", "gender": "male"},
            {"id": "simran", "label": "Simran (Female)", "gender": "female"},
        ],
        "default_voice": DEFAULT_VOICE,
        "max_text_length": MAX_TEXT_LENGTH,
    }

@router.post("/speak")
async def speak(body: SpeakRequest, request: Request):
    """Synthesize speech audio from text or verified message_id."""
    if not is_voice_enabled():
        raise HTTPException(
            status_code=503,
            detail={"code": "VOICE_DISABLED", "message": "Voice synthesis is currently disabled or unconfigured."}
        )

    # 1. Voice allowlist check
    voice = body.voice.lower().strip()
    if voice not in ALLOWED_VOICES:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "INVALID_VOICE",
                "message": f"Voice '{body.voice}' is not supported. Allowed voices: {sorted(list(ALLOWED_VOICES))}",
            }
        )

    # 2. Language allowlist check
    lang = body.language_code.strip()
    if lang not in ALLOWED_LANGUAGES:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "INVALID_LANGUAGE",
                "message": f"Language '{body.language_code}' is not supported. Allowed codes: {sorted(list(ALLOWED_LANGUAGES))}",
            }
        )

    # 3. Resolve target text (prefer server-verified message_id bound to this session)
    target_text = ""
    session_id = _extract_request_session(request)
    if body.message_id:
        verified = get_chat_reply(body.message_id, session_id=session_id)
        if verified:
            target_text = verified
        elif not body.text:
            raise HTTPException(
                status_code=404,
                detail={"code": "MESSAGE_NOT_FOUND", "message": f"Message ID '{body.message_id}' not found or expired for this session."}
            )

    if not target_text and body.text:
        target_text = body.text

    if not target_text or not target_text.strip():
        raise HTTPException(
            status_code=400,
            detail={"code": "EMPTY_TEXT", "message": "No text provided for speech synthesis."}
        )

    # 4. Hard maximum text length check (413 Payload Too Large)
    if len(target_text) > MAX_TEXT_LENGTH:
        raise HTTPException(
            status_code=413,
            detail={
                "code": "TEXT_TOO_LONG",
                "message": f"Text length ({len(target_text)}) exceeds limit of {MAX_TEXT_LENGTH} characters.",
            }
        )

    # 5. Extract client IP
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
    elif request.client and request.client.host:
        client_ip = request.client.host
    else:
        client_ip = "127.0.0.1"

    # 6. Execute synthesis
    try:
        audio_bytes, mime_type = await synthesize_speech(
            text=target_text,
            voice=voice,
            language_code=lang,
            pace=body.pace,
            client_ip=client_ip,
        )
        return Response(content=audio_bytes, media_type=mime_type)
    except PermissionError as ex:
        # Rate limit hit
        raise HTTPException(
            status_code=429,
            detail={"code": "RATE_LIMIT_EXCEEDED", "message": str(ex)}
        )
    except TimeoutError as ex:
        raise HTTPException(
            status_code=504,
            detail={"code": "UPSTREAM_TIMEOUT", "message": "Voice synthesis provider timed out."}
        )
    except ValueError as ex:
        raise HTTPException(
            status_code=400,
            detail={"code": "VALIDATION_ERROR", "message": str(ex)}
        )
    except Exception as ex:
        logger.error("TTS Synthesis error: %s", ex)
        raise HTTPException(
            status_code=502,
            detail={"code": "UPSTREAM_ERROR", "message": "Speech synthesis service temporarily unavailable."}
        )
