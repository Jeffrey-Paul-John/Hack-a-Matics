"""Session manager providing isolated simulation instances per user/client."""
from __future__ import annotations
import logging
import time
from typing import Callable
from ..simulation.engine import SimulationEngine

logger = logging.getLogger(__name__)


class SessionManager:
    """Thread-safe registry mapping session tokens to dedicated SimulationEngine instances."""

    def __init__(self, config_factory: Callable[[], dict], max_idle_seconds: int = 7200):
        self.config_factory = config_factory
        self.max_idle_seconds = max_idle_seconds
        self.sessions: dict[str, tuple[SimulationEngine, float]] = {}
        # Fallback default engine for unauthenticated or legacy clients
        self.default_engine = SimulationEngine(self.config_factory())

    def get_or_create(self, session_id: str | None) -> SimulationEngine:
        """Fetch active session engine or instantiate a dedicated instance."""
        if not session_id or session_id in ("default", "null", "undefined"):
            return self.default_engine

        now = time.time()
        if session_id in self.sessions:
            engine, _ = self.sessions[session_id]
            self.sessions[session_id] = (engine, now)
            return engine

        self.cleanup_idle()
        new_engine = SimulationEngine(self.config_factory())
        self.sessions[session_id] = (new_engine, now)
        logger.info("Initialized isolated simulation session '%s'", session_id)
        return new_engine

    def reset_session(self, session_id: str | None, seed: int = 42, strategy: str = "resource_aware") -> SimulationEngine:
        """Reset only the specified session's simulation engine."""
        now = time.time()
        new_engine = SimulationEngine(self.config_factory(), seed=seed, strategy=strategy)
        if not session_id or session_id in ("default", "null", "undefined"):
            self.default_engine = new_engine
            return self.default_engine

        self.sessions[session_id] = (new_engine, now)
        logger.info("Reset isolated simulation session '%s' with seed %d, strategy %s", session_id, seed, strategy)
        return new_engine

    def cleanup_idle(self) -> int:
        """Evict sessions that have been inactive longer than max_idle_seconds."""
        now = time.time()
        expired = [sid for sid, (_, last_seen) in self.sessions.items() if now - last_seen > self.max_idle_seconds]
        for sid in expired:
            del self.sessions[sid]
        if expired:
            logger.info("Evicted %d expired simulation sessions", len(expired))
        return len(expired)
