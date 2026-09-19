"""Unit tests for the Sarvam TTS service and router."""
import os
import unittest.mock as mock
import pytest
from fastapi.testclient import TestClient

from medflow.api.main import app
from medflow.api.tts_router import store_chat_reply
from medflow.services.tts_service import (
    ByteBoundedLRUCache,
    is_voice_enabled,
    redact_clinical_text,
    synthesize_speech,
)

@pytest.fixture
def client():
    return TestClient(app)

def test_tts_config_disabled_by_default(monkeypatch, client):
    monkeypatch.delenv("VOICE_ENABLED", raising=False)
    monkeypatch.delenv("SARVAM_API_KEY", raising=False)
    res = client.get("/tts/config")
    assert res.status_code == 200
    data = res.json()
    assert data["enabled"] is False
    assert len(data["voices"]) == 2
    assert data["default_voice"] == "shubh"

def test_tts_speak_503_when_disabled(monkeypatch, client):
    monkeypatch.delenv("VOICE_ENABLED", raising=False)
    res = client.post("/tts/speak", json={"text": "Hello world", "voice": "shubh"})
    assert res.status_code == 503
    assert res.json()["detail"]["code"] == "VOICE_DISABLED"

def test_tts_invalid_voice_rejected(monkeypatch, client):
    monkeypatch.setenv("VOICE_ENABLED", "true")
    monkeypatch.setenv("SARVAM_API_KEY", "dummy_key")
    res = client.post("/tts/speak", json={"text": "Hello world", "voice": "invalid_voice"})
    assert res.status_code == 400
    assert res.json()["detail"]["code"] == "INVALID_VOICE"

def test_tts_invalid_language_rejected(monkeypatch, client):
    monkeypatch.setenv("VOICE_ENABLED", "true")
    monkeypatch.setenv("SARVAM_API_KEY", "dummy_key")
    res = client.post(
        "/tts/speak",
        json={"text": "Hello world", "voice": "shubh", "language_code": "fr-FR"},
    )
    assert res.status_code == 400
    assert res.json()["detail"]["code"] == "INVALID_LANGUAGE"

def test_tts_413_payload_too_large(monkeypatch, client):
    monkeypatch.setenv("VOICE_ENABLED", "true")
    monkeypatch.setenv("SARVAM_API_KEY", "dummy_key")
    oversized = "a" * 2501
    res = client.post("/tts/speak", json={"text": oversized, "voice": "shubh"})
    assert res.status_code == 413
    assert res.json()["detail"]["code"] == "TEXT_TOO_LONG"

def test_clinical_redaction_server_side():
    raw = "Patient P0042 with MRN #98212 born on DOB: 1980-05-12, contact +91 98765 43210."
    scrubbed = redact_clinical_text(raw)
    assert "P0042" not in scrubbed
    assert "98212" not in scrubbed
    assert "1980-05-12" not in scrubbed
    assert "98765" not in scrubbed
    assert "[Medical Record Number]" in scrubbed
    assert "[Contact Number]" in scrubbed

def test_byte_bounded_lru_cache_eviction():
    import asyncio
    cache = ByteBoundedLRUCache(max_bytes=100)
    # Put 60 bytes
    asyncio.run(cache.set("key1", b"x" * 60, "audio/wav"))
    assert cache.current_bytes == 60

    # Put another 50 bytes (60 + 50 = 110 > 100), should evict key1
    asyncio.run(cache.set("key2", b"y" * 50, "audio/wav"))
    assert cache.current_bytes == 50
    val1 = asyncio.run(cache.get("key1"))
    val2 = asyncio.run(cache.get("key2"))
    assert val1 is None
    assert val2 is not None

def test_speak_by_message_id_success(monkeypatch, client):
    monkeypatch.setenv("VOICE_ENABLED", "true")
    monkeypatch.setenv("SARVAM_API_KEY", "dummy_key")

    msg_id = store_chat_reply("There are 5 ICU beds currently free in unit 1.")

    fake_wav = b"RIFFfakeWAVcontent"
    import base64
    fake_b64 = base64.b64encode(fake_wav).decode("utf-8")

    class FakeResponse:
        status_code = 200
        def json(self):
            return {"audios": [fake_b64]}

    with mock.patch("httpx.AsyncClient.post", return_value=FakeResponse()):
        res = client.post(
            "/tts/speak",
            json={"message_id": msg_id, "voice": "simran", "language_code": "en-IN"},
        )
        assert res.status_code == 200
        assert res.content == fake_wav
        assert res.headers["content-type"] == "audio/wav"

def test_tts_upstream_429_handled_gracefully(monkeypatch, client):
    monkeypatch.setenv("VOICE_ENABLED", "true")
    monkeypatch.setenv("SARVAM_API_KEY", "dummy_key")

    class Fake429Response:
        status_code = 429
        headers = {"Retry-After": "1"}
        def json(self):
            return {"error": "Rate limit exceeded"}

    with mock.patch("httpx.AsyncClient.post", return_value=Fake429Response()):
        res = client.post(
            "/tts/speak",
            json={"text": "Hello rate limit test", "voice": "shubh", "language_code": "en-IN"},
        )
        assert res.status_code in (429, 502)

def test_speak_session_isolation(monkeypatch, client):
    monkeypatch.setenv("VOICE_ENABLED", "true")
    monkeypatch.setenv("SARVAM_API_KEY", "dummy_key")

    # Store reply for session_A
    msg_id = store_chat_reply("Confidential triage reply", session_id="session_A")

    fake_wav = b"RIFFfakeWAVcontent"
    import base64
    fake_b64 = base64.b64encode(fake_wav).decode("utf-8")

    class FakeResponse:
        status_code = 200
        def json(self):
            return {"audios": [fake_b64]}

    with mock.patch("httpx.AsyncClient.post", return_value=FakeResponse()):
        # Request with session_A: OK (200)
        res_a = client.post(
            "/tts/speak",
            headers={"X-Session-ID": "session_A"},
            json={"message_id": msg_id, "voice": "shubh"},
        )
        assert res_a.status_code == 200

        # Request with session_B: 404 (MESSAGE_NOT_FOUND)
        res_b = client.post(
            "/tts/speak",
            headers={"X-Session-ID": "session_B"},
            json={"message_id": msg_id, "voice": "shubh"},
        )
        assert res_b.status_code == 404
        assert res_b.json()["detail"]["code"] == "MESSAGE_NOT_FOUND"

def test_rate_limit_and_daily_cap_rejection(monkeypatch, client):
    monkeypatch.setenv("VOICE_ENABLED", "true")
    monkeypatch.setenv("SARVAM_API_KEY", "dummy_key")

    import base64
    fake_b64 = base64.b64encode(b"audio").decode("utf-8")
    class FakeResponse:
        status_code = 200
        def json(self):
            return {"audios": [fake_b64]}

    from medflow.services.tts_service import _rate_limits, _daily_counts
    _rate_limits["test_ip_ratelimit"] = [1e12] * 65 # force 65 timestamps in active window

    with mock.patch("httpx.AsyncClient.post", return_value=FakeResponse()):
        res = client.post(
            "/tts/speak",
            headers={"X-Forwarded-For": "test_ip_ratelimit"},
            json={"text": "Rate limit test message", "voice": "shubh"},
        )
        assert res.status_code == 429
        assert "RATE_LIMIT" in res.json()["detail"]["code"]

    # Test daily cap
    from datetime import datetime, timezone
    _rate_limits.pop("test_ip_ratelimit", None)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    _daily_counts["test_ip_dailycap"] = (today, 1005) # over 1000 daily cap

    with mock.patch("httpx.AsyncClient.post", return_value=FakeResponse()):
        res_daily = client.post(
            "/tts/speak",
            headers={"X-Forwarded-For": "test_ip_dailycap"},
            json={"text": "Daily cap test message", "voice": "shubh"},
        )
        assert res_daily.status_code == 429
        assert "RATE_LIMIT" in res_daily.json()["detail"]["code"]

def test_pace_clamping(monkeypatch, client):
    monkeypatch.setenv("VOICE_ENABLED", "true")
    monkeypatch.setenv("SARVAM_API_KEY", "dummy_key")

    import base64
    fake_b64 = base64.b64encode(b"audio").decode("utf-8")
    class FakeResponse:
        status_code = 200
        def json(self):
            return {"audios": [fake_b64]}

    with mock.patch("httpx.AsyncClient.post") as mock_post:
        mock_post.return_value = FakeResponse()
        # Request with pace 0.1 (should clamp to 0.5)
        client.post("/tts/speak", json={"text": "Pace clamp low", "voice": "shubh", "pace": 0.1})
        # Request with pace 3.5 (should clamp to 2.0)
        client.post("/tts/speak", json={"text": "Pace clamp high", "voice": "shubh", "pace": 3.5})

        assert mock_post.call_count == 2
        assert mock_post.call_args_list[0].kwargs["json"]["pace"] == 0.5
        assert mock_post.call_args_list[1].kwargs["json"]["pace"] == 2.0

def test_cache_hit_prevents_upstream_call(monkeypatch, client):
    monkeypatch.setenv("VOICE_ENABLED", "true")
    monkeypatch.setenv("SARVAM_API_KEY", "dummy_key")

    import base64
    fake_b64 = base64.b64encode(b"cached_audio_data").decode("utf-8")
    call_count = [0]

    async def fake_post(url, headers=None, json=None):
        call_count[0] += 1
        class Res:
            status_code = 200
            def json(self):
                return {"audios": [fake_b64]}
        return Res()

    with mock.patch("httpx.AsyncClient.post", side_effect=fake_post):
        res1 = client.post("/tts/speak", json={"text": "Identical phrase for cache testing", "voice": "shubh"})
        res2 = client.post("/tts/speak", json={"text": "Identical phrase for cache testing", "voice": "shubh"})

    assert res1.status_code == 200
    assert res2.status_code == 200
    assert res1.content == res2.content
    assert call_count[0] == 1  # Only 1 upstream request made, second was cache hit!

def test_upstream_timeout_returns_504(monkeypatch, client):
    monkeypatch.setenv("VOICE_ENABLED", "true")
    monkeypatch.setenv("SARVAM_API_KEY", "dummy_key")
    import httpx

    async def fake_timeout(url, headers=None, json=None):
        raise httpx.TimeoutException("Upstream timed out")

    with mock.patch("httpx.AsyncClient.post", side_effect=fake_timeout):
        res = client.post("/tts/speak", json={"text": "Timeout test phrase", "voice": "shubh"})
        assert res.status_code == 504
        assert res.json()["detail"]["code"] == "UPSTREAM_TIMEOUT"

def test_no_request_text_in_logs(monkeypatch, client, caplog):
    monkeypatch.setenv("VOICE_ENABLED", "true")
    monkeypatch.setenv("SARVAM_API_KEY", "dummy_key")

    import base64
    fake_b64 = base64.b64encode(b"audio").decode("utf-8")
    class FakeResponse:
        status_code = 200
        def json(self):
            return {"audios": [fake_b64]}

    secret_text = "TOP_SECRET_CLINICAL_DIAGNOSIS_XYZ_987"
    with caplog.at_level("INFO"):
        with mock.patch("httpx.AsyncClient.post", return_value=FakeResponse()):
            res = client.post("/tts/speak", json={"text": secret_text, "voice": "shubh"})
            assert res.status_code == 200

    # Assert secret text is NEVER logged
    for record in caplog.records:
        assert secret_text not in record.message

