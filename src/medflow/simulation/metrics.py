"""Metrics collected independently from presentation layers."""
from __future__ import annotations
from datetime import datetime
from collections import defaultdict
from ..core.models import Department, PatientStatus, ResourceStatus
class MetricsCollector:
    """Records snapshots and outcomes so reports cannot alter simulation behavior."""
    def __init__(self):
        self.snapshots: list[dict] = []
        self.completed: list[dict] = []
        self.sla_violations = 0
        self.icu_requests = 0
        self.icu_blocked_requests = 0

    def record_icu_arrival(self, blocked: bool) -> None:
        """Record ICU-needing arrival and whether they were blocked by lack of immediate bed."""
        self.icu_requests += 1
        if blocked:
            self.icu_blocked_requests += 1

    def snapshot(self, at: datetime, departments: dict) -> None:
        """Capture queue and resource state at each meaningful event."""
        utilization = {}
        for name, department in departments.items():
            name_str = name.value if hasattr(name, "value") else str(name)
            for kind, pool in department.resource_pools.items():
                kind_str = kind.value if hasattr(kind, "value") else str(kind)
                utilization[f"{name_str}:{kind_str}"] = round(100 * sum(r.status == ResourceStatus.OCCUPIED for r in pool) / len(pool), 2) if pool else 0
        self.snapshots.append({"time": at.isoformat(), "queues": {(name.value if hasattr(name, "value") else str(name)): sum(p.status == PatientStatus.WAITING for p in d.patient_queue) for name,d in departments.items()}, "utilization": utilization})
    def discharge(self, patient, at: datetime, sla_minutes: dict | None = None) -> None:
        """Record queue wait, treatment duration, and full episode outcome at discharge."""
        wait = patient.actual_wait_minutes
        service = patient.treatment_duration_minutes
        admit = patient.treatment_start.isoformat() if patient.treatment_start else patient.arrival_time.isoformat()
        unit_val = patient.department_needed.value if hasattr(patient.department_needed, "value") else str(patient.department_needed)
        urg_val = patient.urgency.value if hasattr(patient.urgency, "value") else str(patient.urgency)
        
        self.completed.append({
            "episode_id": patient.id,
            "patient_id": patient.id,
            "arrival_time": patient.arrival_time.isoformat(),
            "admit_time": admit,
            "discharge_time": at.isoformat(),
            "wait_min": round(wait, 1),
            "treatment_min": round(service, 1),
            "los_min": round(wait + service, 1),
            "wait_minutes": wait,
            "treatment_minutes": service,
            "total_minutes": round(wait + service, 2),
            "acuity_initial": urg_val,
            "acuity_final": urg_val,
            "urgency": urg_val,
            "unit": unit_val,
            "outcome": "DISCHARGED",
        })
        if sla_minutes and wait > sla_minutes[urg_val]:
            self.sla_violations += 1

    def summary(self) -> dict:
        """Create bounded, dashboard-ready aggregates from immutable observations."""
        waits = defaultdict(list)
        treatments = defaultdict(list)
        for item in self.completed:
            waits[item["urgency"]].append(item["wait_minutes"])
            treatments[item["urgency"]].append(item.get("treatment_minutes", 0.0))
        icu_block_prob = round(self.icu_blocked_requests / self.icu_requests, 4) if self.icu_requests > 0 else 0.0
        return {
            "patients_completed": len(self.completed),
            "average_wait_minutes": round(sum(i["wait_minutes"] for i in self.completed)/len(self.completed), 2) if self.completed else 0,
            "average_treatment_minutes": round(sum(i.get("treatment_minutes", 0.0) for i in self.completed)/len(self.completed), 2) if self.completed else 0,
            "wait_by_urgency": {u: {"average": round(sum(v)/len(v), 2), "max": max(v)} for u,v in waits.items()},
            "sla_violations": self.sla_violations,
            "utilization": self.snapshots[-1]["utilization"] if self.snapshots else {},
            "completed_episodes": self.completed,
            "icu_blocking_probability": icu_block_prob,
            "icu_requests": self.icu_requests,
            "icu_blocked_requests": self.icu_blocked_requests,
        }

