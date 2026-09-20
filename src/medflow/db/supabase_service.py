"""Supabase Cloud Persistence and Telemetry Synchronization for PulseGrid."""
from __future__ import annotations
import asyncio
import concurrent.futures
import datetime
import json
import logging
import os
from typing import Any, Optional

try:
    from supabase import Client, create_client
    _SUPABASE_INSTALLED = True
except ImportError:
    Client = Any
    _SUPABASE_INSTALLED = False

from ..simulation.engine import SimulationEngine

logger = logging.getLogger(__name__)

_executor = concurrent.futures.ThreadPoolExecutor(max_workers=3)
_client: Optional[Client] = None


def get_supabase_client() -> Optional[Client]:
    """Retrieve or initialize singleton Supabase client using environment credentials."""
    global _client
    if _client is not None:
        return _client

    if not _SUPABASE_INSTALLED:
        logger.warning("Supabase Python package is not installed.")
        return None

    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_KEY", "").strip() or os.getenv("SUPABASE_ANON_KEY", "").strip()

    if not url or not key:
        logger.debug("Supabase credentials not configured in environment.")
        return None

    try:
        _client = create_client(url, key)
        logger.info("Connected to Supabase project at %s", url)
        return _client
    except Exception as exc:
        logger.error("Failed to initialize Supabase client: %s", exc)
        return None


def serialize_engine_full(engine: SimulationEngine) -> dict[str, Any]:
    """Serialize the full simulation state for database storage."""
    strategy_name = engine.allocator.engine.strategy.__class__.__name__
    strategy_map = {
        "UrgencyOnlyStrategy": "urgency_only",
        "WaitAwareStrategy": "wait_aware",
        "ResourceAwareStrategy": "resource_aware",
        "MDPOptimalStrategy": "mdp_optimal",
    }
    strat_key = strategy_map.get(strategy_name, "resource_aware")

    data: dict[str, Any] = {
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
            "snapshots": engine.metrics.snapshots[-50:] if engine.metrics.snapshots else [],
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

    return data


def _sync_worker(session_id: str, engine: SimulationEngine) -> None:
    """Synchronous worker that pushes state, snapshots, patients and resources to Supabase."""
    client = get_supabase_client()
    if not client:
        return

    try:
        now_iso = engine.clock.now.isoformat()
        full_state = serialize_engine_full(engine)
        metrics_summary = engine.metrics.summary() if hasattr(engine.metrics, "summary") else {}

        # 1. Upsert session row
        session_row = {
            "session_id": session_id,
            "seed": engine.seed,
            "strategy": full_state.get("strategy", "resource_aware"),
            "sim_clock": now_iso,
            "sequence": engine.sequence,
            "source": engine.source,
            "full_state": full_state,
            "metrics": metrics_summary,
            "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }
        client.table("simulation_sessions").upsert(session_row).execute()

        # 2. Insert metrics snapshot
        snapshot_payload = {
            "completed": engine.metrics.completed,
            "sla_violations": engine.metrics.sla_violations,
            "summary": metrics_summary,
        }
        client.table("metrics_snapshots").insert({
            "session_id": session_id,
            "sim_clock": now_iso,
            "payload": snapshot_payload,
        }).execute()

        # 3. Upsert active patients
        patient_rows = []
        for dept in engine.departments.values():
            for p in dept.patient_queue:
                patient_rows.append({
                    "id": p.id,
                    "session_id": session_id,
                    "name": p.name,
                    "arrival_time": p.arrival_time.isoformat(),
                    "urgency": p.urgency.value if hasattr(p.urgency, "value") else str(p.urgency),
                    "department_needed": p.department_needed.value if hasattr(p.department_needed, "value") else str(p.department_needed),
                    "status": p.status.value if hasattr(p.status, "value") else str(p.status),
                    "treatment_start": p.treatment_start.isoformat() if p.treatment_start else None,
                    "actual_wait_minutes": float(p.actual_wait_minutes or 0.0),
                    "treatment_duration_minutes": float(p.treatment_duration_minutes or 0.0),
                    "priority_score": float(p.priority_score or 0.0),
                    "assigned_resources": {
                        (k.value if hasattr(k, "value") else str(k)): v for k, v in p.assigned_resources.items()
                    },
                    "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                })
        if patient_rows:
            client.table("patients").upsert(patient_rows).execute()

        # 4. Upsert resources
        resource_rows = []
        for dept in engine.departments.values():
            for pool in dept.resource_pools.values():
                for r in pool:
                    resource_rows.append({
                        "id": r.id,
                        "session_id": session_id,
                        "type": r.type.value if hasattr(r.type, "value") else str(r.type),
                        "department": r.department.value if hasattr(r.department, "value") else str(r.department),
                        "status": r.status.value if hasattr(r.status, "value") else str(r.status),
                        "assigned_to": r.assigned_to,
                        "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    })
        if resource_rows:
            client.table("resources").upsert(resource_rows).execute()

        logger.debug("Successfully synchronized simulation session '%s' to Supabase.", session_id)
    except Exception as exc:
        logger.warning("Supabase synchronization encountered an error (continuing simulation): %s", exc)


def dispatch_supabase_sync(session_id: str, engine: SimulationEngine) -> None:
    """Non-blocking dispatch of simulation telemetry sync to Supabase."""
    if not os.getenv("SUPABASE_URL") or not os.getenv("SUPABASE_SERVICE_KEY"):
        return
    _executor.submit(_sync_worker, session_id, engine)


def check_supabase_health() -> dict[str, Any]:
    """Test connection and return table diagnostics."""
    client = get_supabase_client()
    if not client:
        return {
            "configured": False,
            "connected": False,
            "url": os.getenv("SUPABASE_URL", "none"),
            "tables": [],
        }

    try:
        # Check simulation_sessions table
        res = client.table("simulation_sessions").select("session_id", count="exact").limit(1).execute()
        return {
            "configured": True,
            "connected": True,
            "url": os.getenv("SUPABASE_URL"),
            "active_sessions_count": res.count or 0,
            "tables": ["simulation_sessions", "metrics_snapshots", "patients", "resources", "allocation_events"],
        }
    except Exception as exc:
        return {
            "configured": True,
            "connected": False,
            "url": os.getenv("SUPABASE_URL"),
            "error": str(exc),
        }
