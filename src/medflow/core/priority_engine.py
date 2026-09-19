"""Priority orchestration separates queue ordering from policies."""
from __future__ import annotations
from datetime import datetime
from .models import Patient
from .strategies import PriorityStrategy, SimulationContext

class PriorityEngine:
    """Calculates and stably orders a queue so allocation decisions are reproducible."""
    def __init__(self, strategy: PriorityStrategy, context: SimulationContext): self.strategy, self.context = strategy, context
    def rank(self, patients: list[Patient], now: datetime) -> list[Patient]:
        """Score waiting patients and use arrival time as an explicit FIFO tie-break."""
        for patient in patients: patient.priority_score = self.strategy.score(patient, now, self.context)
        return sorted(patients, key=lambda p: (-p.priority_score, p.arrival_time, p.id))

