"""Metrics collected independently from presentation layers."""
from __future__ import annotations
from datetime import datetime
from collections import defaultdict
from ..core.models import Department, PatientStatus, ResourceStatus
class MetricsCollector:
    """Records snapshots and outcomes so reports cannot alter simulation behavior."""
    def __init__(self): self.snapshots: list[dict] = []; self.completed: list[dict] = []; self.sla_violations = 0
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
        """Record queue wait and treatment duration outcome separately at discharge."""
        wait = patient.actual_wait_minutes
        service = patient.treatment_duration_minutes
        self.completed.append({
            "patient_id": patient.id,
            "urgency": patient.urgency.value,
            "wait_minutes": wait,
            "treatment_minutes": service,
            "total_minutes": round(wait + service, 2),
        })
        if sla_minutes and wait > sla_minutes[patient.urgency.value]:
            self.sla_violations += 1
    def summary(self) -> dict:
        """Create bounded, dashboard-ready aggregates from immutable observations."""
        waits = defaultdict(list)
        treatments = defaultdict(list)
        for item in self.completed:
            waits[item["urgency"]].append(item["wait_minutes"])
            treatments[item["urgency"]].append(item.get("treatment_minutes", 0.0))
        return {
            "patients_completed": len(self.completed),
            "average_wait_minutes": round(sum(i["wait_minutes"] for i in self.completed)/len(self.completed), 2) if self.completed else 0,
            "average_treatment_minutes": round(sum(i.get("treatment_minutes", 0.0) for i in self.completed)/len(self.completed), 2) if self.completed else 0,
            "wait_by_urgency": {u: {"average": round(sum(v)/len(v), 2), "max": max(v)} for u,v in waits.items()},
            "sla_violations": self.sla_violations,
            "utilization": self.snapshots[-1]["utilization"] if self.snapshots else {},
        }
