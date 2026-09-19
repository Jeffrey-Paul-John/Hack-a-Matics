"""Minimal discrete-event clock."""
from __future__ import annotations
from datetime import datetime, timedelta
class SimulationClock:
    """Advances only to meaningful events, avoiding artificial tick work."""
    def __init__(self, start: datetime): self.now = start
    def advance_to(self, moment: datetime) -> None:
        """Move forward monotonically, protecting deterministic event order."""
        if moment < self.now: raise ValueError("clock cannot move backwards")
        self.now = moment
    def advance(self, minutes: float) -> None:
        """Convenience advancement for controlled dashboard stepping."""
        self.now += timedelta(minutes=minutes)
