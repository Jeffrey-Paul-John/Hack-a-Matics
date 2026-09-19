"""Swappable, deterministic patient-priority policies."""
from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol
from .models import Patient

import hashlib

@dataclass
class SimulationContext:
    """Read-only scoring context, isolating strategies from resource mutation."""
    urgency_weights: dict[str, float]; wait_weight: float; scarcity_weight: float
    max_wait: float; scarcity: dict[str, float]
    seed: int = 42

class PriorityStrategy(Protocol):
    """Defines a transparent policy for ranking waiting patients."""
    def score(self, patient: Patient, now: datetime, context: SimulationContext) -> float: ...

def _wait(patient: Patient, now: datetime, context: SimulationContext) -> float:
    return min(max(0, (now - patient.wait_start).total_seconds() / 60), context.max_wait) / context.max_wait

class StaticPriorityStrategy:
    """Prioritizes clinical urgency only; stable allocation preserves FIFO ties."""
    def score(self, patient: Patient, now: datetime, context: SimulationContext) -> float:
        return float(context.urgency_weights.get(patient.urgency.value, 0.0))

class UrgencyOnlyStrategy(StaticPriorityStrategy):
    """Alias for backwards compatibility."""
    pass

class FIFOStrategy:
    """First-In, First-Out: ranks strictly by waiting duration so earlier arrivals are served first."""
    def score(self, patient: Patient, now: datetime, context: SimulationContext) -> float:
        return max(0.0, (now - patient.wait_start).total_seconds() / 60.0)

class RandomStrategy:
    """Deterministic pseudo-random priority using SHA-256 hash of patient ID."""
    def __init__(self, seed: int = 42):
        self.seed = seed

    def score(self, patient: Patient, now: datetime, context: SimulationContext) -> float:
        seed_val = getattr(context, "seed", self.seed)
        token = f"{seed_val}:{patient.id}"
        digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
        # Scale to [0.0, 100.0] uniformly
        return (int(digest[:8], 16) / 0xFFFFFFFF) * 100.0

class WaitAwareStrategy:
    """Raises priority gradually to reduce unsafe waits without eclipsing urgency."""
    def score(self, patient: Patient, now: datetime, context: SimulationContext) -> float:
        return context.urgency_weights[patient.urgency.value] + context.wait_weight * _wait(patient, now, context) * 10

class ResourceAwareStrategy(WaitAwareStrategy):
    """Adds a bounded boost where the requested care pathway is scarce."""
    def score(self, patient: Patient, now: datetime, context: SimulationContext) -> float:
        base = super().score(patient, now, context)
        depletion = max((context.scarcity.get(resource.value if hasattr(resource, "value") else str(resource), 0) for resource in patient.resource_requirements), default=0)
        return base + context.scarcity_weight * depletion


