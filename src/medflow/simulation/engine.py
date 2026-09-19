"""Main event-driven MedFlow pipeline."""
from __future__ import annotations
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from ..core.allocator import Allocator
from ..core.models import Department, DepartmentType, PatientStatus, Resource, ResourceStatus, ResourceType, Urgency
from ..core.priority_engine import PriorityEngine
from ..core.resource_manager import ResourceManager
from ..core.strategies import ResourceAwareStrategy, SimulationContext, UrgencyOnlyStrategy, WaitAwareStrategy
from .arrival_generator import ArrivalGenerator
from ..core.clock import SimulationClock
from .metrics import MetricsCollector
from ..math.mdp_policy import MDPOptimalStrategy
class SimulationEngine:
    """Coordinates arrivals, allocation, releases, and metrics under one seeded clock."""
    def __init__(self, config: dict, seed: int | None = None, strategy: str | None = None):
        self.config, self.seed = deepcopy(config), seed if seed is not None else config["seed"]
        self.clock = SimulationClock(datetime(2026, 1, 1, tzinfo=timezone.utc)); self.departments = self._departments()
        self.manager = ResourceManager(self.departments); self.metrics = MetricsCollector(); self.generator = ArrivalGenerator(self.config, self.seed)
        selector = strategy or config["priority"]["strategy"]; classes = {"urgency_only": UrgencyOnlyStrategy, "wait_aware": WaitAwareStrategy, "resource_aware": ResourceAwareStrategy, "mdp_optimal": MDPOptimalStrategy}
        pr = config["priority"]; context = SimulationContext(config["urgency_weights"], pr["wait_weight"], pr["scarcity_weight"], pr["max_acceptable_wait_minutes"], {})
        self.allocator = Allocator(self.manager, PriorityEngine(classes[selector](), context)); self.departures: list[tuple[datetime,str]] = []; self.next_arrival, self.source = self.generator.next_after(self.clock.now); self.sequence = 0; self.running = False
    def _departments(self) -> dict:
        result = {}
        for name, capacities in self.config["capacities"].items():
            dep = DepartmentType(name) if name in DepartmentType._value2member_map_ else name
            dep_str = dep.value if hasattr(dep, "value") else str(dep)
            pools = {}
            for kind, amount in capacities.items():
                kind_enum = ResourceType(kind) if kind in ResourceType._value2member_map_ else kind
                kind_str = kind_enum.value if hasattr(kind_enum, "value") else str(kind_enum)
                pools[kind_enum] = [Resource(id=f"{dep_str}-{kind_str}-{n+1}", type=kind_enum, department=dep) for n in range(amount)]
            result[dep] = Department(name=dep, resource_pools=pools)
        return result
    def step(self) -> dict:
        """Advance to exactly one arrival or departure, then allocate feasible queue members."""
        next_departure = min(self.departures, default=(datetime.max.replace(tzinfo=timezone.utc), ""))
        if self.next_arrival <= next_departure[0]:
            self.clock.advance_to(self.next_arrival); self.sequence += 1; patient = self.generator.patient(self.clock.now, self.source, self.sequence); self.departments[patient.department_needed].patient_queue.append(patient)
            self.next_arrival, self.source = self.generator.next_after(self.clock.now)
        else:
            self.clock.advance_to(next_departure[0]); self.departures.remove(next_departure); patient = self._patient(next_departure[1])
            if patient:
                for resource_id in patient.assigned_resources.values(): self.manager.release(resource_id)
                patient.status = PatientStatus.DISCHARGED; self.metrics.discharge(patient, self.clock.now, self.config["sla_minutes"])
        for event in self.allocator.tick(self.clock.now):
            if event.allocated:
                patient = self._patient(event.patient_id); service = self.config["service_minutes"][patient.urgency.value]; self.departures.append((self.clock.now + timedelta(minutes=service), patient.id))
        self.metrics.snapshot(self.clock.now, self.departments); return self.state()
    def run(self, duration: int | None = None) -> dict:
        """Run headlessly through a finite horizon for reporting and comparison."""
        end = self.clock.now + timedelta(minutes=duration or self.config["simulation_duration_minutes"]); self.running = True
        while self.clock.now < end: self.step()
        self.running = False; return self.state()
    def _patient(self, patient_id: str): return next((p for d in self.departments.values() for p in d.patient_queue if p.id == patient_id), None)
    def state(self) -> dict:
        """Return presentation-safe live state without leaking mutable domain objects."""
        return {
            "now": self.clock.now.isoformat(),
            "running": self.running,
            "queues": {
                (name.value if hasattr(name, "value") else str(name)): [
                    {
                        "id": p.id,
                        "urgency": p.urgency.value if hasattr(p.urgency, "value") else str(p.urgency),
                        "score": round(p.priority_score, 2),
                        "status": p.status.value if hasattr(p.status, "value") else str(p.status),
                        "wait_minutes": round((self.clock.now - p.wait_start).total_seconds() / 60, 1),
                    }
                    for p in sorted(d.patient_queue, key=lambda x: -x.priority_score)
                    if p.status == PatientStatus.WAITING
                ]
                for name, d in self.departments.items()
            },
            "resources": {
                (name.value if hasattr(name, "value") else str(name)): {
                    (kind.value if hasattr(kind, "value") else str(kind)): {
                        "occupied": sum(r.status == ResourceStatus.OCCUPIED for r in pool),
                        "down": sum(r.status in (ResourceStatus.MAINTENANCE, ResourceStatus.OUT_OF_SERVICE) for r in pool),
                        "available": sum(r.status == ResourceStatus.AVAILABLE for r in pool),
                        "total": len(pool),
                        "items": [{"id": r.id, "status": r.status.value} for r in pool],
                    }
                    for kind, pool in d.resource_pools.items()
                }
                for name, d in self.departments.items()
            },
            "metrics": self.metrics.summary(),
        }

