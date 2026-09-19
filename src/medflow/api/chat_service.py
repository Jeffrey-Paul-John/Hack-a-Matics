"""Live Clinical Operations Copilot answering questions from real-time simulation telemetry."""
from __future__ import annotations
import logging
import os
from typing import TYPE_CHECKING
import requests
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from ..simulation.engine import SimulationEngine

SARVAM_LANG_MAP = {
    "hi": "hi-IN",
    "kn": "kn-IN",
    "te": "te-IN",
    "ta": "ta-IN",
    "mr": "mr-IN",
    "bn": "bn-IN",
    "gu": "gu-IN",
    "ml": "ml-IN",
    "pa": "pa-IN",
    "od": "od-IN",
}

FALLBACK_PREFIXES = {
    "hi": "[हिंदी] सिमुलेशन समय",
    "ta": "[தமிழ்] உருவகப்படுத்துதல் நேரம்",
    "te": "[తెలుగు] సిమ్యులేషన్ సమయం",
    "kn": "[ಕನ್ನಡ] ಸಿಮ್ಯುಲೇಶನ್ ಸಮಯ",
    "mr": "[मराठी] सिम्युलेशन वेळ",
    "bn": "[বাংলা] সিমুলেশন সময়",
}


def translate_with_sarvam(text: str, target_lang: str) -> str | None:
    """Translate text using Sarvam AI Mayura translation API if key is configured."""
    api_key = os.getenv("SARVAM_API_KEY")
    if not api_key:
        return None

    target_code = SARVAM_LANG_MAP.get(target_lang)
    if not target_code:
        return None

    try:
        res = requests.post(
            "https://api.sarvam.ai/translate",
            headers={
                "api-subscription-key": api_key.strip(),
                "Content-Type": "application/json",
            },
            json={
                "input": text,
                "source_language_code": "en-IN",
                "target_language_code": target_code,
                "model": "mayura:v1",
                "mode": "formal",
            },
            timeout=5.0,
        )
        if res.status_code == 200:
            data = res.json()
            translated = data.get("translated_text")
            if translated:
                return translated.strip()
        else:
            logger.warning("Sarvam API returned status %s: %s", res.status_code, res.text)
    except Exception as exc:
        logger.warning("Sarvam translation call failed: %s", exc)

    return None


def answer_clinical_query(engine: SimulationEngine, message: str, language: str = "en") -> str:
    """Analyze query and compute response dynamically using live simulation state and metrics."""
    state = engine.state()
    metrics = state["metrics"]
    resources = state["resources"]
    queues = state["queues"]
    sim_time = state["now"][11:16] if len(state["now"]) >= 16 else state["now"]

    msg_lower = message.lower()
    total_waiting = sum(len(q) for q in queues.values())
    critical_waiting = sum(sum(1 for p in q if p.get("urgency") == "CRITICAL") for q in queues.values())
    avg_wait = metrics.get("average_wait_minutes", 0.0)
    completed = metrics.get("patients_completed", 0)
    sla_breaches = metrics.get("sla_violations", 0)

    # Dynamic resource state inquiry
    if any(k in msg_lower for k in ("icu", "bed", "doctor", "nurse", "ambulance", "capacity", "free", "occupied", "down")):
        dept_match = None
        for dept in resources:
            if dept.lower() in msg_lower:
                dept_match = dept
                break

        if "icu" in msg_lower:
            dept_match = "ICU" if "ICU" in resources else dept_match

        if dept_match and dept_match in resources:
            dept_res = resources[dept_match]
            details = []
            for kind, pool in dept_res.items():
                occ = pool.get("occupied", 0)
                tot = pool.get("total", 0)
                free = pool.get("available", max(0, tot - occ))
                down = pool.get("down", 0)
                details.append(f"{kind.replace('_', ' ')}: {free}/{tot} available ({occ} occupied{f', {down} offline' if down else ''})")
            summary_text = f"At simulation time {sim_time}, {dept_match} status: " + ", ".join(details) + "."
        else:
            total_occ = sum(p.get("occupied", 0) for d in resources.values() for p in d.values())
            total_cap = sum(p.get("total", 0) for d in resources.values() for p in d.values())
            total_free = sum(p.get("available", max(0, p.get("total", 0) - p.get("occupied", 0))) for d in resources.values() for p in d.values())
            total_down = sum(p.get("down", 0) for d in resources.values() for p in d.values())
            summary_text = (
                f"At simulation time {sim_time}, hospital-wide capacity: {total_free} assets available, "
                f"{total_occ} occupied out of {total_cap} total"
                f"{f' ({total_down} offline)' if total_down else ''}."
            )

    # Wait time & queue inquiry
    elif any(k in msg_lower for k in ("wait", "delay", "queue", "line", "sla", "breach")):
        summary_text = (
            f"At simulation time {sim_time}: {total_waiting} patients are waiting in triage queues "
            f"({critical_waiting} CRITICAL). Average wait time is {avg_wait:.1f} minutes. "
            f"SLA breaches: {sla_breaches}. Completed care: {completed} patients."
        )

    # Policy / strategy inquiry
    elif any(k in msg_lower for k in ("strategy", "policy", "algorithm", "triage")):
        active_strategy = engine.allocator.engine.strategy.__class__.__name__
        summary_text = (
            f"At simulation time {sim_time}: Active allocation policy is {active_strategy}. "
            f"Triage prioritizes patients dynamically based on clinical urgency and system load."
        )

    # General hospital status
    else:
        summary_text = (
            f"MedFlow Copilot [Time {sim_time}]: {total_waiting} patients waiting ({critical_waiting} CRITICAL). "
            f"Average wait {avg_wait:.1f} min across {completed} completed patients. SLA breaches: {sla_breaches}."
        )

    # Live Sarvam translation or fallback
    if language != "en" and language in SARVAM_LANG_MAP:
        sarvam_res = translate_with_sarvam(summary_text, language)
        if sarvam_res:
            return sarvam_res
        # Fallback if offline or API key unavailable
        prefix = FALLBACK_PREFIXES.get(language, f"[{language}]")
        return f"{prefix} {sim_time}: {summary_text}"

    return summary_text
