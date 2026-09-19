"""Simulation persistence layer: save and resume simulation snapshots to disk."""
from __future__ import annotations
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..core.clock import SimulationClock
from ..core.models import (
    Department,
    DepartmentType,
    Patient,
    PatientStatus,
    Resource,
    ResourceStatus,
    ResourceType,
    Urgency,
)
from ..simulation.engine import SimulationEngine


def _parse_dt(dt_val: Any) -> datetime | None:
    if not dt_val:
        return None
    if isinstance(dt_val, datetime):
        return dt_val
    return datetime.fromisoformat(str(dt_val))


def save_snapshot(engine: SimulationEngine, filepath: str = "data/sim_snapshot.json") -> str:
    """Serialize full engine state to JSON snapshot file."""
    os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)

    strategy_name = engine.allocator.engine.strategy.__class__.__name__
    strategy_map = {
        "UrgencyOnlyStrategy": "urgency_only",
        "WaitAwareStrategy": "wait_aware",
        "ResourceAwareStrategy": "resource_aware",
        "MDPOptimalStrategy": "mdp_optimal",
    }
    strat_key = strategy_map.get(strategy_name, "resource_aware")

    data = {
        "clock": engine.clock.now.isoformat(),
        "seed": engine.seed,
        "sequence": engine.sequence,
        "strategy": strat_key,
        "next_arrival": engine.next_arrival.isoformat(),
        "source": engine.source,
        "departures": [[dep[0].isoformat(), dep[1]] for dep in engine.departures],
        "departments": {},
        "metrics": {
            "completed": engine.metrics.completed,
            "sla_violations": engine.metrics.sla_violations,
            "snapshots": engine.metrics.snapshots,
        },
    }

    for dept_key, dept in engine.departments.items():
        dept_name = dept_key.value if hasattr(dept_key, "value") else str(dept_key)
        dept_data: dict[str, Any] = {"name": dept_name, "resource_pools": {}, "patient_queue": []}

        for kind_key, pool in dept.resource_pools.items():
            kind_name = kind_key.value if hasattr(kind_key, "value") else str(kind_key)
            dept_data["resource_pools"][kind_name] = [
                {
                    "id": r.id,
                    "type": r.type.value if hasattr(r.type, "value") else str(r.type),
                    "department": r.department.value if hasattr(r.department, "value") else str(r.department),
                    "status": r.status.value if hasattr(r.status, "value") else str(r.status),
                    "assigned_to": r.assigned_to,
                }
                for r in pool
            ]

        for p in dept.patient_queue:
            dept_data["patient_queue"].append({
                "id": p.id,
                "name": p.name,
                "arrival_time": p.arrival_time.isoformat(),
                "urgency": p.urgency.value if hasattr(p.urgency, "value") else str(p.urgency),
                "department_needed": p.department_needed.value if hasattr(p.department_needed, "value") else str(p.department_needed),
                "resource_requirements": [k.value if hasattr(k, "value") else str(k) for k in p.resource_requirements],
                "wait_start": p.wait_start.isoformat(),
                "treatment_start": p.treatment_start.isoformat() if p.treatment_start else None,
                "actual_wait_minutes": p.actual_wait_minutes,
                "treatment_duration_minutes": p.treatment_duration_minutes,
                "status": p.status.value if hasattr(p.status, "value") else str(p.status),
                "assigned_resources": {
                    (k.value if hasattr(k, "value") else str(k)): v for k, v in p.assigned_resources.items()
                },
                "priority_score": p.priority_score,
            })

        data["departments"][dept_name] = dept_data

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    return filepath


def load_snapshot(filepath: str, config: dict) -> SimulationEngine:
    """Restore simulation engine from serialized snapshot."""
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    strategy = data.get("strategy", config["priority"]["strategy"])
    engine = SimulationEngine(config, seed=data.get("seed", 42), strategy=strategy)

    # Restore clock and sequence
    engine.clock.now = _parse_dt(data["clock"])
    engine.sequence = data.get("sequence", 0)
    engine.next_arrival = _parse_dt(data["next_arrival"])
    engine.source = data.get("source", "walkin")
    engine.departures = [(_parse_dt(d[0]), d[1]) for d in data.get("departures", [])]

    # Restore departments and resources
    for dept_name, dept_data in data.get("departments", {}).items():
        dep_enum = DepartmentType(dept_name) if dept_name in DepartmentType._value2member_map_ else dept_name
        if dep_enum in engine.departments:
            dept = engine.departments[dep_enum]
            for kind_name, pool_list in dept_data.get("resource_pools", {}).items():
                kind_enum = ResourceType(kind_name) if kind_name in ResourceType._value2member_map_ else kind_name
                if kind_enum in dept.resource_pools:
                    restored_pool = []
                    for r_dict in pool_list:
                        status_val = r_dict["status"]
                        status_enum = ResourceStatus(status_val) if status_val in ResourceStatus._value2member_map_ else ResourceStatus.AVAILABLE
                        restored_pool.append(
                            Resource(
                                id=r_dict["id"],
                                type=kind_enum,
                                department=dep_enum,
                                status=status_enum,
                                assigned_to=r_dict.get("assigned_to"),
                            )
                        )
                    dept.resource_pools[kind_enum] = restored_pool

            # Restore patient queue
            restored_queue = []
            for p_dict in dept_data.get("patient_queue", []):
                urg_val = p_dict["urgency"]
                urg_enum = Urgency(urg_val) if urg_val in Urgency._value2member_map_ else Urgency.MODERATE
                p_status_val = p_dict["status"]
                p_status_enum = PatientStatus(p_status_val) if p_status_val in PatientStatus._value2member_map_ else PatientStatus.WAITING
                restored_queue.append(
                    Patient(
                        id=p_dict["id"],
                        name=p_dict["name"],
                        arrival_time=_parse_dt(p_dict["arrival_time"]),
                        urgency=urg_enum,
                        department_needed=dep_enum,
                        resource_requirements=[
                            ResourceType(r) if r in ResourceType._value2member_map_ else r
                            for r in p_dict.get("resource_requirements", [])
                        ],
                        wait_start=_parse_dt(p_dict["wait_start"]),
                        treatment_start=_parse_dt(p_dict.get("treatment_start")),
                        actual_wait_minutes=p_dict.get("actual_wait_minutes", 0.0),
                        treatment_duration_minutes=p_dict.get("treatment_duration_minutes", 0.0),
                        status=p_status_enum,
                        assigned_resources=p_dict.get("assigned_resources", {}),
                        priority_score=p_dict.get("priority_score", 0.0),
                    )
                )
            dept.patient_queue = restored_queue

    # Restore metrics
    metrics_data = data.get("metrics", {})
    engine.metrics.completed = metrics_data.get("completed", [])
    engine.metrics.sla_violations = metrics_data.get("sla_violations", 0)
    engine.metrics.snapshots = metrics_data.get("snapshots", [])

    return engine
