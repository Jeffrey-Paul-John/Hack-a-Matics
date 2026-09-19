"""Small exact MDP used as a pluggable admission-priority policy."""
from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime
from ..core.models import Patient, Urgency
from ..core.strategies import SimulationContext
@dataclass
class ValueIterationResult:
    """Finite-state value-iteration output retained for inspection and reproducibility."""
    values: dict[tuple[int,int], float]; iterations: int; delta: float
class MDPOptimalStrategy:
    """Admission strategy derived from value iteration over urgency and wait buckets."""
    def __init__(self, discount: float = .9, threshold: float = 1e-6, max_iterations: int = 200):
        self.discount = discount; self.result = self._solve(threshold, max_iterations)
    def _solve(self, threshold: float, max_iterations: int) -> ValueIterationResult:
        states = [(urgency, wait) for urgency in range(4) for wait in range(4)]; values = {state: 0.0 for state in states}
        for iteration in range(1, max_iterations + 1):
            updated, delta = {}, 0.0
            for urgency, wait in states:
                reward = -(wait + 1) * (urgency + 1) - (30 if urgency == 3 and wait >= 2 else 0)
                next_state = (urgency, min(3, wait + 1)); value = reward + self.discount * values[next_state]
                updated[(urgency, wait)] = value; delta = max(delta, abs(value - values[(urgency, wait)]))
            values = updated
            if delta < threshold: return ValueIterationResult(values, iteration, delta)
        return ValueIterationResult(values, max_iterations, delta)
    def score(self, patient: Patient, now: datetime, context: SimulationContext) -> float:
        """Convert the solved state's avoidable-cost value into a higher-is-better rank."""
        urgency = {Urgency.LOW: 0, Urgency.MODERATE: 1, Urgency.HIGH: 2, Urgency.CRITICAL: 3}[patient.urgency]; waited = max(0, (now-patient.wait_start).total_seconds()/60)
        bucket = min(3, int(waited / max(1, context.max_wait / 4)))
        return -self.result.values[(urgency, bucket)] + context.urgency_weights[patient.urgency.value]
