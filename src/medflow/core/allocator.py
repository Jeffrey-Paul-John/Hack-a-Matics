"""Per-event allocation service."""
from __future__ import annotations
from datetime import datetime
from .models import AllocationEvent, DepartmentType, PatientStatus
from .priority_engine import PriorityEngine
from .resource_manager import ResourceManager

class Allocator:
    """Allocates highest-priority feasible patients without letting one blocked case stall a queue."""
    def __init__(self, manager: ResourceManager, engine: PriorityEngine): self.manager, self.engine = manager, engine
    def tick(self, now: datetime) -> list[AllocationEvent]:
        """Process every department queue and return an audit trail for metrics."""
        events = []
        for kind, department in self.manager.departments.items():
            self.engine.context.scarcity = self.manager.scarcity(kind)
            waiting = [p for p in department.patient_queue if p.status in (PatientStatus.WAITING, PatientStatus.ICU_PENDING)]
            for patient in self.engine.rank(waiting, now):
                resources = self.manager.reserve_all(patient.resource_requirements, kind, patient.id)
                if resources:
                    patient.status = PatientStatus.IN_TREATMENT; patient.assigned_resources = {t: r.id for t, r in resources.items()}
                    events.append(AllocationEvent(patient_id=patient.id, timestamp=now, allocated=True, reason="allocated", score=patient.priority_score))
                else: events.append(AllocationEvent(patient_id=patient.id, timestamp=now, allocated=False, reason="capacity unavailable", score=patient.priority_score))
        return events
