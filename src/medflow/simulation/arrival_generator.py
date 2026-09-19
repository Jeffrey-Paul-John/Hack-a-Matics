"""Seeded Poisson arrival generation."""
from __future__ import annotations
from datetime import datetime, timedelta
import random, uuid
from ..core.models import DepartmentType, Patient, ResourceType, Urgency
class ArrivalGenerator:
    """Produces reproducible walk-in and ambulance arrivals from configurable rates."""
    def __init__(self, config: dict, seed: int):
        self.config, self.seed, self.rng = config, seed, random.Random(seed)
    def next_after(self, now: datetime) -> tuple[datetime, str]:
        """Sample competing exponential processes and return the earliest arrival class."""
        rates = self.config["arrival_rates_per_hour"]
        walk, ambulance = self.rng.expovariate(rates["walkin"] / 60), self.rng.expovariate(rates["ambulance"] / 60)
        return now + timedelta(minutes=min(walk, ambulance)), "ambulance" if ambulance < walk else "walkin"
    def patient(self, when: datetime, source: str, sequence: int) -> Patient:
        """Create an arrival with source-sensitive urgency and correct care requirements."""
        choices = list(Urgency); weights = [self.config["urgency_distribution"][u.value] for u in choices]
        urgency = self.rng.choices(choices, weights=weights)[0]
        if source == "ambulance" and urgency == Urgency.LOW: urgency = Urgency.HIGH
        available = list(self.config["capacities"].keys())
        icu = next((d for d in available if "ICU" in str(d).upper()), available[0])
        er = next((d for d in available if any(k in str(d).upper() for k in ("ER", "EMERGENCY", "TRAUMA"))), available[0])
        gen = next((d for d in available if any(k in str(d).upper() for k in ("GEN", "WARD", "MED"))), available[-1])
        dept_name = icu if urgency == Urgency.CRITICAL and self.rng.random() < .45 else (er if urgency in (Urgency.CRITICAL, Urgency.HIGH) else gen)
        department = DepartmentType(dept_name) if dept_name in DepartmentType._value2member_map_ else dept_name
        dept_caps = self.config["capacities"].get(dept_name, {})
        req_keys = [k for k in dept_caps.keys() if k != "AMBULANCE"] or list(dept_caps.keys())
        requirements = [ResourceType(k) if k in ResourceType._value2member_map_ else k for k in req_keys]
        
        # Pre-assign service duration deterministically at generation time
        base_service = float(self.config["service_minutes"].get(urgency.value, 45.0))
        sub_rng = random.Random(f"{self.seed}:P{sequence:04d}")
        service_duration = round(base_service * sub_rng.uniform(0.9, 1.1), 1)
        escalation_risk = round(sub_rng.uniform(0.0, 1.0), 4)

        return Patient(
            id=f"P{sequence:04d}",
            name=f"Patient {sequence:04d}",
            arrival_time=when,
            wait_start=when,
            urgency=urgency,
            department_needed=department,
            resource_requirements=requirements,
            service_duration_minutes=service_duration,
            escalation_risk=escalation_risk,
        )

