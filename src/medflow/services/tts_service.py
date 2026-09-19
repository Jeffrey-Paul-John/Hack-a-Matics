"""Sarvam AI Text-to-Speech integration service with in-memory byte-bounded LRU caching."""
from __future__ import annotations
import asyncio
import base64
from collections import OrderedDict
from datetime import datetime, timezone
import hashlib
import logging
import os
import re
import time
from typing import Optional
from dotenv import load_dotenv
import httpx

load_dotenv()

logger = logging.getLogger("medflow.tts")

SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech"
ALLOWED_VOICES = {"shubh", "simran"}
ALLOWED_LANGUAGES = {
    "en-IN", "hi-IN", "bn-IN", "kn-IN", "ml-IN",
    "mr-IN", "od-IN", "pa-IN", "ta-IN", "te-IN", "gu-IN"
}
DEFAULT_VOICE = os.environ.get("DEFAULT_VOICE", "shubh").lower()
if DEFAULT_VOICE not in ALLOWED_VOICES:
    DEFAULT_VOICE = "shubh"

MAX_TEXT_LENGTH = 2500
MAX_CACHE_BYTES = 50 * 1024 * 1024  # 50 MB byte limit
RATE_LIMIT_PER_MINUTE = 60
DAILY_LIMIT_PER_IP = 1000

# Redaction patterns for clinical safety
REDACTION_PATTERNS = [
    # MRN / Medical Record Number: MRN-12345, MRN #12345, MRN: 9821
    (re.compile(r"\bMRN[:\s#-]*[A-Z0-9]{4,12}\b", re.IGNORECASE), "[Medical Record Number]"),
    # Phone numbers (Indian and standard international formats)
    (re.compile(r"(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b"), "[Contact Number]"),
    (re.compile(r"\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b"), "[Contact Number]"),
    # Date of Birth: DOB: 12/04/1985, Born on 1990-05-12
    (re.compile(r"\b(?:DOB|Date of Birth)[:\s]+[0-9]{1,4}[-/.][0-9]{1,2}[-/.][0-9]{1,4}\b", re.IGNORECASE), "[Date of Birth]"),
    # Patient identifiable IDs like Patient P0042
    (re.compile(r"\bPatient\s+P\d{4}\b", re.IGNORECASE), "the patient"),
    # Generic SSN/Aadhaar 12-digit numbers
    (re.compile(r"\b\d{4}\s\d{4}\s\d{4}\b"), "[ID Number]"),
]

def redact_clinical_text(text: str) -> str:
    """Server-side scrub of patient identifiers, MRNs, phone numbers, and DOBs."""
    scrubbed = text
    for pattern, replacement in REDACTION_PATTERNS:
        scrubbed = pattern.sub(replacement, scrubbed)
    return scrubbed

class ByteBoundedLRUCache:
    """In-memory LRU cache bounded strictly by total memory bytes."""
    def __init__(self, max_bytes: int = MAX_CACHE_BYTES):
        self.max_bytes = max_bytes
        self.current_bytes = 0
        self._cache: OrderedDict[str, tuple[bytes, str, int]] = OrderedDict()
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> Optional[tuple[bytes, str]]:
        async with self._lock:
            if key not in self._cache:
                return None
            self._cache.move_to_end(key)
            audio, mime, _ = self._cache[key]
            return audio, mime

    async def set(self, key: str, audio: bytes, mime: str) -> None:
        async with self._lock:
            size = len(audio)
            if size > self.max_bytes:
                # Payload larger than entire cache capacity
                return
            if key in self._cache:
                _, _, old_size = self._cache.pop(key)
                self.current_bytes -= old_size

            while self.current_bytes + size > self.max_bytes and self._cache:
                _, (_, _, evicted_size) = self._cache.popitem(last=False)
                self.current_bytes -= evicted_size

            self._cache[key] = (audio, mime, size)
            self.current_bytes += size

    async def clear(self) -> None:
        async with self._lock:
            self._cache.clear()
            self.current_bytes = 0

_cache = ByteBoundedLRUCache()

# IP rate limiting state: ip -> list of timestamps
_rate_limits: dict[str, list[float]] = {}
_daily_counts: dict[str, tuple[str, int]] = {}  # ip -> (date_str, count)
_rate_lock = asyncio.Lock()

async def check_rate_limit(client_ip: str) -> tuple[bool, str]:
    """Validate sliding per-minute rate limit and daily request cap per IP."""
    now = time.time()
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    async with self._rate_lock if hasattr(check_rate_limit, "_lock") else _rate_lock:
        # 1. Daily cap check
        date_str, count = _daily_counts.get(client_ip, (today_str, 0))
        if date_str != today_str:
            date_str, count = today_str, 0
        if count >= DAILY_LIMIT_PER_IP:
            return False, f"Daily TTS limit of {DAILY_LIMIT_PER_IP} requests exceeded."
        _daily_counts[client_ip] = (date_str, count + 1)

        # 2. Per-minute sliding window check
        timestamps = _rate_limits.setdefault(client_ip, [])
        cutoff = now - 60.0
        # Evict older than 1 minute
        _rate_limits[client_ip] = [ts for ts in timestamps if ts > cutoff]
        if len(_rate_limits[client_ip]) >= RATE_LIMIT_PER_MINUTE:
            return False, f"Rate limit of {RATE_LIMIT_PER_MINUTE} requests/min exceeded."
        _rate_limits[client_ip].append(now)

    return True, ""

def is_voice_enabled() -> bool:
    """Check feature flag and API key availability."""
    flag = os.environ.get("VOICE_ENABLED", "").strip().lower()
    has_key = bool(os.environ.get("SARVAM_API_KEY", "").strip())
    return (flag in ("1", "true", "yes", "on")) and has_key

async def synthesize_speech(
    text: str,
    voice: str = "shubh",
    language_code: str = "en-IN",
    pace: float = 1.0,
    client_ip: str = "127.0.0.1",
) -> tuple[bytes, str]:
    """Synthesize speech using Sarvam AI Bulbul v3 with retry, backoff, and caching.
    
    Returns: (audio_bytes, mime_type)
    """
    if not is_voice_enabled():
        raise RuntimeError("Voice synthesis is currently disabled.")

    api_key = os.environ.get("SARVAM_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("SARVAM_API_KEY is not configured.")

    voice = voice.lower().strip()
    if voice not in ALLOWED_VOICES:
        raise ValueError(f"Voice '{voice}' is not supported. Allowed: {sorted(list(ALLOWED_VOICES))}")

    if language_code not in ALLOWED_LANGUAGES:
        raise ValueError(f"Language code '{language_code}' is not supported. Allowed: {sorted(list(ALLOWED_LANGUAGES))}")

    # Clamp pace between 0.5 and 2.0
    pace = max(0.5, min(2.0, round(float(pace), 2)))

    # Hard character limit check
    if len(text) > MAX_TEXT_LENGTH:
        raise ValueError(f"Text length ({len(text)}) exceeds maximum allowable length of {MAX_TEXT_LENGTH} characters.")

    # Server-side clinical redaction
    sanitized_text = redact_clinical_text(text)
    if not sanitized_text.strip():
        # Empty text after redaction/stripping
        raise ValueError("Text is empty after sanitization.")

    # Check Cache
    cache_key = hashlib.sha256(
        f"{sanitized_text}:{voice}:{language_code}:{pace}:bulbul:v3".encode("utf-8")
    ).hexdigest()

    cached = await _cache.get(cache_key)
    if cached is not None:
        logger.info(
            "TTS Cache Hit | ip=%s voice=%s lang=%s chars=%d",
            client_ip, voice, language_code, len(sanitized_text)
        )
        return cached

    # Rate limiting
    allowed, reason = await check_rate_limit(client_ip)
    if not allowed:
        logger.warning("TTS Rate Limit Rejection | ip=%s reason=%s", client_ip, reason)
        raise PermissionError(reason)

    # Call Sarvam AI REST endpoint
    headers = {
        "api-subscription-key": api_key,
        "Content-Type": "application/json",
    }
    payload = {
        "text": sanitized_text,
        "speaker": voice,
        "model": "bulbul:v3",
        "language_code": language_code,
        "pitch": 0,
        "pace": pace,
        "loudness": 1.0,
        "speech_sample_rate": 22050,
    }

    start_time = time.time()
    last_err: Optional[Exception] = None

    # 1 retry with exponential backoff
    for attempt in range(2):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(SARVAM_TTS_URL, headers=headers, json=payload)

            latency_ms = int((time.time() - start_time) * 1000)

            if resp.status_code == 200:
                data = resp.json()
                # Parse audio base64 from 'audios' list or 'audio_content'
                audios = data.get("audios")
                if audios and isinstance(audios, list) and len(audios) > 0:
                    b64_audio = audios[0]
                else:
                    b64_audio = data.get("audio_content", "")

                if not b64_audio:
                    raise RuntimeError("No audio data returned in response payload.")

                audio_bytes = base64.b64decode(b64_audio)
                mime = "audio/wav"

                # Store in cache
                await _cache.set(cache_key, audio_bytes, mime)

                logger.info(
                    "TTS Success | ip=%s status=200 latency_ms=%d bytes=%d voice=%s lang=%s",
                    client_ip, latency_ms, len(audio_bytes), voice, language_code
                )
                return audio_bytes, mime

            elif resp.status_code == 429:
                logger.warning("TTS Upstream 429 Too Many Requests | ip=%s latency_ms=%d", client_ip, latency_ms)
                if attempt == 0:
                    retry_header = resp.headers.get("Retry-After")
                    sleep_sec = 0.5
                    if retry_header:
                        try:
                            sleep_sec = max(0.1, min(float(retry_header), 5.0))
                        except (ValueError, TypeError):
                            sleep_sec = 0.5
                    await asyncio.sleep(sleep_sec)
                    continue
                raise RuntimeError("Sarvam AI upstream rate limit exceeded.")

            elif 400 <= resp.status_code < 500:
                logger.error("TTS Upstream 4xx Client Error | status=%d latency_ms=%d", resp.status_code, latency_ms)
                raise RuntimeError(f"Sarvam AI client error {resp.status_code}: {resp.text[:200]}")

            else:
                logger.error("TTS Upstream 5xx Server Error | status=%d latency_ms=%d", resp.status_code, latency_ms)
                if attempt == 0:
                    await asyncio.sleep(0.5)
                    continue
                raise RuntimeError(f"Sarvam AI returned server error {resp.status_code}")

        except httpx.TimeoutException as ex:
            latency_ms = int((time.time() - start_time) * 1000)
            logger.warning("TTS Upstream Timeout | latency_ms=%d attempt=%d", latency_ms, attempt + 1)
            last_err = ex
            if attempt == 0:
                await asyncio.sleep(0.5)
                continue
            raise TimeoutError("Sarvam AI TTS request timed out.") from ex
        except Exception as ex:
            last_err = ex
            if attempt == 0:
                await asyncio.sleep(0.5)
                continue
            break

    raise last_err or RuntimeError("TTS generation failed.")
