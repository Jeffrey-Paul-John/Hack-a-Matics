"""What-If counterfactual scenario comparison engine."""
from __future__ import annotations
from copy import deepcopy
import json
from typing import Any
from ..core.models import DepartmentType, Resource, ResourceStatus, ResourceType
from ..simulation.engine import SimulationEngine
from ..simulation.persistence import save_snapshot, load_snapshot


def run_what_if_comparison(
    current_engine: SimulationEngine,
    config: dict,
    horizon_minutes: int = 60,
    resource_adjustments: dict[str, dict[str, int]] | None = None,
    strategy_override: str | None = None,
) -> dict[str, Any]:
    """
    Forks the current simulation engine into two parallel branches:
    - Branch A: Status Quo (baseline continues unchanged)
    - Branch B: Counterfactual scenario with added resources or altered strategy
    Runs both forward for horizon_minutes under the exact same stochastic conditions.
    """
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        # 1. Snapshot current active state
        save_snapshot(current_engine, tmp_path)

        # 2. Clone into Branch A and Branch B
        branch_a = load_snapshot(tmp_path, config)
        branch_b = load_snapshot(tmp_path, config)

        # 3. Apply counterfactual modifications to Branch B
        adjustments = resource_adjustments or {}
        for dept_str, pools in adjustments.items():
            dep_key = DepartmentType(dept_str) if dept_str in DepartmentType._value2member_map_ else dept_str
            if dep_key in branch_b.departments:
                dept = branch_b.departments[dep_key]
                for kind_str, extra_count in pools.items():
                    if extra_count > 0:
                        kind_key = ResourceType(kind_str) if kind_str in ResourceType._value2member_map_ else kind_str
                        current_pool = dept.resource_pools.setdefault(kind_key, [])
                        for i in range(extra_count):
                            res_id = f"{dept_str}-{kind_str}-WHATIF-{len(current_pool) + i + 1}"
                            current_pool.append(
                                Resource(
                                    id=res_id,
                                    type=kind_key,
                                    department=dep_key,
                                    status=ResourceStatus.AVAILABLE,
                                )
                            )

        if strategy_override:
            branch_b.switch_strategy(strategy_override)

        # 4. Simulate both branches forward
        branch_a.run(horizon_minutes)
        branch_b.run(horizon_minutes)

        summary_a = branch_a.metrics.summary()
        summary_b = branch_b.metrics.summary()

        wait_a = summary_a.get("average_wait_minutes", 0.0)
        wait_b = summary_b.get("average_wait_minutes", 0.0)
        delta_wait = round(wait_b - wait_a, 2)
        pct_wait_change = round(((wait_b - wait_a) / max(0.1, wait_a)) * 100, 1)

        sla_a = summary_a.get("sla_violations", 0)
        sla_b = summary_b.get("sla_violations", 0)
        delta_sla = sla_b - sla_a

        completed_a = summary_a.get("patients_completed", 0)
        completed_b = summary_b.get("patients_completed", 0)
        delta_completed = completed_b - completed_a

        return {
            "horizon_minutes": horizon_minutes,
            "adjustments": adjustments,
            "strategy_override": strategy_override,
            "baseline": summary_a,
            "counterfactual": summary_b,
            "delta": {
                "wait_minutes": delta_wait,
                "wait_change_percent": pct_wait_change,
                "sla_violations": delta_sla,
                "patients_completed": delta_completed,
            },
        }
    finally:
        import os
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass
