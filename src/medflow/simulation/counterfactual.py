"""What-If counterfactual scenario comparison engine with CRN multi-replication and bottleneck diagnostics."""
from __future__ import annotations
from copy import deepcopy
import json
import logging
import os
import tempfile
from typing import Any

from ..core.models import DepartmentType, Resource, ResourceStatus, ResourceType, PatientStatus
from ..math.statistics import bootstrap_ci_paired, paired_ttest, holm_bonferroni
from ..simulation.arrival_generator import ArrivalGenerator
from ..simulation.engine import SimulationEngine
from ..simulation.persistence import save_snapshot, load_snapshot

logger = logging.getLogger("medflow.counterfactual")

DEPT_SYNONYMS: dict[str, DepartmentType] = {
    "er": DepartmentType.ER,
    "emergency": DepartmentType.ER,
    "emergency_room": DepartmentType.ER,
    "emergency room": DepartmentType.ER,
    "icu": DepartmentType.ICU,
    "intensive_care": DepartmentType.ICU,
    "intensive care": DepartmentType.ICU,
    "general": DepartmentType.GENERAL,
    "general_ward": DepartmentType.GENERAL,
    "general ward": DepartmentType.GENERAL,
    "ward": DepartmentType.GENERAL,
    "surgery": DepartmentType.SURGERY,
    "or": DepartmentType.SURGERY,
    "operating_theatre": DepartmentType.SURGERY,
    "operating room": DepartmentType.SURGERY,
    "pediatric": DepartmentType.PEDIATRIC,
    "cardiac": DepartmentType.CARDIAC,
}

RESOURCE_SYNONYMS: dict[str, ResourceType] = {
    "nurse": ResourceType.NURSE,
    "nurses": ResourceType.NURSE,
    "bed": ResourceType.BED,
    "beds": ResourceType.BED,
    "icu_bed": ResourceType.ICU_BED,
    "icu_beds": ResourceType.ICU_BED,
    "icubed": ResourceType.ICU_BED,
    "icubeds": ResourceType.ICU_BED,
    "doctor": ResourceType.DOCTOR,
    "doctors": ResourceType.DOCTOR,
    "ambulance": ResourceType.AMBULANCE,
    "ambulances": ResourceType.AMBULANCE,
    "ot": ResourceType.OT,
    "ots": ResourceType.OT,
}


def normalize_dept(dept_str: str) -> DepartmentType:
    """Normalize any department string/alias to canonical DepartmentType enum."""
    cleaned = str(dept_str).strip().lower().replace("-", "_")
    if cleaned in DEPT_SYNONYMS:
        return DEPT_SYNONYMS[cleaned]
    for member in DepartmentType:
        if member.value.lower() == cleaned:
            return member
    return DepartmentType.ER


def normalize_resource(res_str: str) -> ResourceType:
    """Normalize any resource string/alias to canonical ResourceType enum."""
    cleaned = str(res_str).strip().lower().replace("-", "_")
    if cleaned in RESOURCE_SYNONYMS:
        return RESOURCE_SYNONYMS[cleaned]
    for member in ResourceType:
        if member.value.lower() == cleaned:
            return member
    return ResourceType.BED


def _format_resource_list(changes: list[dict]) -> tuple[str, str, str]:
    """Returns (joined_str, verb_neg, verb_pos).
    e.g. ('ER Nurses and ICU Nurses', "aren't", "do not")
    or ('ER Nurse', "isn't", "does not").
    """
    if not changes:
        return ("", "isn't", "does not")

    if len(changes) == 1:
        c = changes[0]
        dept = c["department"]
        res = c["resource"].capitalize()
        return (f"{dept} {res}", "isn't", "does not")

    # Multiple resources: pluralize each and join with 'and'
    names = []
    for c in changes:
        dept = c["department"]
        res = c["resource"].capitalize()
        if not res.endswith("s"):
            res += "s"
        names.append(f"{dept} {res}")

    if len(names) == 2:
        joined = f"{names[0]} and {names[1]}"
    else:
        joined = ", ".join(names[:-1]) + f", and {names[-1]}"
    return (joined, "aren't", "do not")


def compute_fork_context(engine: SimulationEngine) -> dict[str, Any]:
    """Inspect live engine state at fork time to compute queues, utilization, and identify bottleneck."""
    total_waiting = 0
    dept_queues: dict[str, int] = {}
    resource_utilization: dict[str, float] = {}
    pool_stats: list[dict[str, Any]] = []

    for dep_key, dep in engine.departments.items():
        dep_name = dep_key.value if hasattr(dep_key, "value") else str(dep_key)
        q_count = len([p for p in dep.patient_queue if getattr(p, "status", None) == PatientStatus.WAITING])
        dept_queues[dep_name] = q_count
        total_waiting += q_count

        for kind_key, pool in dep.resource_pools.items():
            kind_name = kind_key.value if hasattr(kind_key, "value") else str(kind_key)
            pool_label = f"{dep_name} {kind_name.capitalize()}"
            total = len(pool)
            occupied = sum(r.status == ResourceStatus.OCCUPIED for r in pool)
            down = sum(r.status in (ResourceStatus.MAINTENANCE, ResourceStatus.OUT_OF_SERVICE) for r in pool)
            util = round(occupied / total, 3) if total > 0 else 0.0
            resource_utilization[f"{dep_name}:{kind_name}"] = util

            pool_stats.append({
                "department": dep_name,
                "resource": kind_name,
                "label": pool_label,
                "total": total,
                "occupied": occupied,
                "down": down,
                "available": max(0, total - occupied - down),
                "utilization": util,
            })

    # Bottleneck is resource with highest utilization, breaking ties with highest department queue.
    # When no patients are waiting (total_waiting == 0), there is no active bottleneck.
    if total_waiting == 0:
        bottleneck = None
    elif pool_stats:
        def bottleneck_key(item: dict[str, Any]) -> tuple[float, int]:
            return (item["utilization"], dept_queues.get(item["department"], 0))

        highest = max(pool_stats, key=bottleneck_key)
        bottleneck = {
            "department": highest["department"],
            "resource": highest["resource"],
            "label": highest["label"],
            "utilization": highest["utilization"],
            "available": highest["available"],
            "total": highest["total"],
            "description": f"{highest['label']} is {int(highest['utilization'] * 100)}% utilized ({highest['occupied']}/{highest['total']} occupied)",
        }
    else:
        bottleneck = None

    return {
        "total_waiting": total_waiting,
        "department_queues": dept_queues,
        "resource_utilization": resource_utilization,
        "bottleneck": bottleneck,
    }


def format_p_value(p: float) -> str:
    """Format p-value to avoid misleading 'p = 0.000' display."""
    if p < 0.001:
        return "p < 0.001"
    return f"p = {p:.3f}"


def extract_queue_and_wait_metrics(engine: SimulationEngine) -> tuple[float, float, int]:
    """
    Extracts censoring-aware metrics:
    - censoring_aware_wait: Mean accrued wait time across all patients (completed, in treatment, and still waiting).
    - p90_wait: 90th percentile wait time across all patients.
    - end_queue_length: Total number of patients with status == WAITING at the horizon end.
    """
    all_patients = [p for d in engine.departments.values() for p in d.patient_queue]
    waiting_count = sum(1 for p in all_patients if getattr(p, "status", None) == PatientStatus.WAITING)

    waits: list[float] = []
    for p in all_patients:
        status = getattr(p, "status", None)
        if status in (PatientStatus.DISCHARGED, PatientStatus.IN_TREATMENT):
            waits.append(float(getattr(p, "actual_wait_minutes", 0.0)))
        elif status == PatientStatus.WAITING:
            wait_start = getattr(p, "wait_start", engine.clock.now)
            accrued = max(0.0, (engine.clock.now - wait_start).total_seconds() / 60.0)
            waits.append(float(accrued))

    if not waits:
        return 0.0, 0.0, waiting_count

    avg_wait = round(sum(waits) / len(waits), 2)
    sorted_waits = sorted(waits)
    p90_idx = int(len(sorted_waits) * 0.9)
    p90_wait = round(sorted_waits[min(p90_idx, len(sorted_waits) - 1)], 2)
    return avg_wait, p90_wait, waiting_count


def run_what_if_comparison(
    current_engine: SimulationEngine,
    config: dict,
    horizon_minutes: int = 60,
    resource_adjustments: dict[str, dict[str, int]] | None = None,
    strategy_override: str | None = None,
    replications: int = 20,
) -> dict[str, Any]:
    """
    Forks the active simulation state into Baseline and Counterfactual branches.
    Runs N seeded replications using Common Random Numbers (CRN) to evaluate
    true policy/capacity impact with 95% Confidence Intervals, censoring-aware metrics,
    and bottleneck explainability.
    """
    replications = max(1, min(50, replications or 20))
    fork_context = compute_fork_context(current_engine)

    # 1. Normalize adjustments and audit baseline vs counterfactual capacity
    raw_adjustments = resource_adjustments or {}
    normalized_adjustments: list[tuple[DepartmentType, ResourceType, int]] = []
    applied_changes: list[dict[str, Any]] = []

    for dept_raw, pool_raw in raw_adjustments.items():
        dep_enum = normalize_dept(dept_raw)
        dep_str = dep_enum.value
        for kind_raw, extra_count in pool_raw.items():
            if extra_count > 0:
                kind_enum = normalize_resource(kind_raw)
                kind_str = kind_enum.value
                normalized_adjustments.append((dep_enum, kind_enum, extra_count))

                # Baseline capacity from live engine
                baseline_pool = current_engine.departments.get(dep_enum)
                base_count = len(baseline_pool.resource_pools.get(kind_enum, [])) if baseline_pool else 0
                counter_count = base_count + extra_count

                plural_label = f"{kind_str.capitalize()}s" if not kind_str.endswith("s") else kind_str.capitalize()
                has_no_demand = dep_enum == DepartmentType.SURGERY or dep_enum not in current_engine.departments
                display_label = f"{dep_str} {plural_label}: {base_count} -> {counter_count} (+{extra_count})"
                applied_changes.append({
                    "department": dep_str,
                    "resource": kind_str,
                    "baseline": base_count,
                    "counterfactual": counter_count,
                    "delta": extra_count,
                    "display": display_label,
                    "no_demand": has_no_demand,
                })

    # 2. Snapshot current active state to disk for replay across all replications
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        save_snapshot(current_engine, tmp_path)

        rep_wait_a: list[float] = []
        rep_wait_b: list[float] = []
        rep_sla_a: list[int] = []
        rep_sla_b: list[int] = []
        rep_comp_a: list[int] = []
        rep_comp_b: list[int] = []
        rep_censored_wait_a: list[float] = []
        rep_censored_wait_b: list[float] = []
        rep_p90_a: list[float] = []
        rep_p90_b: list[float] = []
        rep_queue_a: list[int] = []
        rep_queue_b: list[int] = []

        base_seed = int(current_engine.seed if current_engine.seed is not None else 42)

        # 3. Multi-Replication Runner using Common Random Numbers (CRN)
        for r in range(replications):
            rep_seed = (base_seed + r * 37 + 101) % 2147483647

            # Load pristine state clone for Branch A (Baseline)
            branch_a = load_snapshot(tmp_path, config)
            branch_a.seed = rep_seed
            branch_a.generator = ArrivalGenerator(branch_a.config, rep_seed)

            # Load pristine state clone for Branch B (Counterfactual)
            branch_b = load_snapshot(tmp_path, config)
            branch_b.seed = rep_seed
            branch_b.generator = ArrivalGenerator(branch_b.config, rep_seed)

            # Apply normalized counterfactual capacity to Branch B
            for dep_enum, kind_enum, extra_count in normalized_adjustments:
                if dep_enum in branch_b.departments:
                    dept = branch_b.departments[dep_enum]
                    pool = dept.resource_pools.setdefault(kind_enum, [])
                    for i in range(extra_count):
                        res_id = f"{dep_enum.value}-{kind_enum.value}-WHATIF-{len(pool) + i + 1}"
                        pool.append(
                            Resource(
                                id=res_id,
                                type=kind_enum,
                                department=dep_enum,
                                status=ResourceStatus.AVAILABLE,
                            )
                        )
                    # Keep config capacities in sync
                    dep_name = dep_enum.value
                    kind_name = kind_enum.value
                    if "capacities" in branch_b.config and dep_name in branch_b.config["capacities"]:
                        branch_b.config["capacities"][dep_name][kind_name] = (
                            branch_b.config["capacities"][dep_name].get(kind_name, 0) + extra_count
                        )

            if strategy_override:
                branch_b.switch_strategy(strategy_override)

            # Advance both branches under identical seeded arrival streams
            branch_a.run(horizon_minutes)
            branch_b.run(horizon_minutes)

            summ_a = branch_a.metrics.summary()
            summ_b = branch_b.metrics.summary()

            rep_wait_a.append(summ_a.get("average_wait_minutes", 0.0))
            rep_wait_b.append(summ_b.get("average_wait_minutes", 0.0))
            rep_sla_a.append(summ_a.get("sla_violations", 0))
            rep_sla_b.append(summ_b.get("sla_violations", 0))
            rep_comp_a.append(summ_a.get("patients_completed", 0))
            rep_comp_b.append(summ_b.get("patients_completed", 0))

            cw_a, p90_a, q_a = extract_queue_and_wait_metrics(branch_a)
            cw_b, p90_b, q_b = extract_queue_and_wait_metrics(branch_b)
            rep_censored_wait_a.append(cw_a)
            rep_censored_wait_b.append(cw_b)
            rep_p90_a.append(p90_a)
            rep_p90_b.append(p90_b)
            rep_queue_a.append(q_a)
            rep_queue_b.append(q_b)

        # 4. Statistical aggregation
        # Completed wait (patients discharged)
        mean_wait_a = round(sum(rep_wait_a) / replications, 2)
        mean_wait_b = round(sum(rep_wait_b) / replications, 2)
        diff_waits = [b - a for a, b in zip(rep_wait_a, rep_wait_b)]
        mean_delta_wait = round(sum(diff_waits) / replications, 2)
        ci_wait_res = bootstrap_ci_paired(rep_wait_b, rep_wait_a, ci=0.95, n_boot=1000)
        ci_wait_95 = [ci_wait_res["ci_lower"], ci_wait_res["ci_upper"]]
        ttest_wait = paired_ttest(rep_wait_b, rep_wait_a)
        p_val_wait = ttest_wait["p_value"]
        wait_significant = bool((ci_wait_95[0] * ci_wait_95[1] > 0) and (ci_wait_95[0] != 0 or ci_wait_95[1] != 0))

        # Censoring-aware wait (accrued wait across ALL patients: completed + waiting)
        mean_censored_wait_a = round(sum(rep_censored_wait_a) / replications, 2)
        mean_censored_wait_b = round(sum(rep_censored_wait_b) / replications, 2)
        diff_cw = [b - a for a, b in zip(rep_censored_wait_a, rep_censored_wait_b)]
        mean_delta_censored_wait = round(sum(diff_cw) / replications, 2)
        ci_cw_res = bootstrap_ci_paired(rep_censored_wait_b, rep_censored_wait_a, ci=0.95, n_boot=1000)
        ci_censored_wait_95 = [ci_cw_res["ci_lower"], ci_cw_res["ci_upper"]]
        ttest_cw = paired_ttest(rep_censored_wait_b, rep_censored_wait_a)
        p_val_censored_wait = ttest_cw["p_value"]
        censored_wait_significant = bool((ci_censored_wait_95[0] * ci_censored_wait_95[1] > 0) and (ci_censored_wait_95[0] != 0 or ci_censored_wait_95[1] != 0))

        # P90 wait
        mean_p90_a = round(sum(rep_p90_a) / replications, 2)
        mean_p90_b = round(sum(rep_p90_b) / replications, 2)
        diff_p90 = [b - a for a, b in zip(rep_p90_a, rep_p90_b)]
        mean_delta_p90 = round(sum(diff_p90) / replications, 2)

        # End of horizon queue length
        mean_queue_a = round(sum(rep_queue_a) / replications, 1)
        mean_queue_b = round(sum(rep_queue_b) / replications, 1)
        diff_queue = [b - a for a, b in zip(rep_queue_a, rep_queue_b)]
        mean_delta_queue = round(sum(diff_queue) / replications, 1)
        ci_queue_res = bootstrap_ci_paired([float(x) for x in rep_queue_b], [float(x) for x in rep_queue_a], ci=0.95, n_boot=1000)
        ci_queue_95 = [ci_queue_res["ci_lower"], ci_queue_res["ci_upper"]]
        ttest_queue = paired_ttest([float(x) for x in rep_queue_b], [float(x) for x in rep_queue_a])
        p_val_queue = ttest_queue["p_value"]
        queue_significant = bool((ci_queue_95[0] * ci_queue_95[1] > 0) and (ci_queue_95[0] != 0 or ci_queue_95[1] != 0))

        # SLA violations
        mean_sla_a = round(sum(rep_sla_a) / replications, 1)
        mean_sla_b = round(sum(rep_sla_b) / replications, 1)
        diff_slas = [b - a for a, b in zip(rep_sla_a, rep_sla_b)]
        mean_delta_sla = round(sum(diff_slas) / replications, 1)
        ci_sla_res = bootstrap_ci_paired([float(x) for x in rep_sla_b], [float(x) for x in rep_sla_a], ci=0.95, n_boot=1000)
        ci_sla_95 = [ci_sla_res["ci_lower"], ci_sla_res["ci_upper"]]
        ttest_sla = paired_ttest([float(x) for x in rep_sla_b], [float(x) for x in rep_sla_a])
        p_val_sla = ttest_sla["p_value"]
        sla_significant = bool((ci_sla_95[0] * ci_sla_95[1] > 0) and (ci_sla_95[0] != 0 or ci_sla_95[1] != 0))

        # Discharges (completed patients)
        mean_comp_a = round(sum(rep_comp_a) / replications, 1)
        mean_comp_b = round(sum(rep_comp_b) / replications, 1)
        diff_comps = [b - a for a, b in zip(rep_comp_a, rep_comp_b)]
        mean_delta_comp = round(sum(diff_comps) / replications, 1)
        ci_comp_res = bootstrap_ci_paired([float(x) for x in rep_comp_b], [float(x) for x in rep_comp_a], ci=0.95, n_boot=1000)
        ci_comp_95 = [ci_comp_res["ci_lower"], ci_comp_res["ci_upper"]]
        ttest_comp = paired_ttest([float(x) for x in rep_comp_b], [float(x) for x in rep_comp_a])
        p_val_comp = ttest_comp["p_value"]
        comp_significant = bool((ci_comp_95[0] * ci_comp_95[1] > 0) and (ci_comp_95[0] != 0 or ci_comp_95[1] != 0))

        # Multiple testing correction with Holm-Bonferroni across wait, discharges, SLA, and queue metrics
        adj_p_values = holm_bonferroni([p_val_wait, p_val_comp, p_val_sla, p_val_censored_wait, p_val_queue])
        adj_p_wait, adj_p_comp, adj_p_sla, adj_p_cw, adj_p_queue = adj_p_values

        # An effect is significant if CI excludes zero for any primary or secondary metric
        is_significant = bool(wait_significant or comp_significant or sla_significant or censored_wait_significant or queue_significant)
        pct_wait_change = round(((mean_wait_b - mean_wait_a) / max(0.1, mean_wait_a)) * 100, 1)

        # 5. Directional Classification & Honest Result Messaging
        # Lower is better for: wait, censoring_aware_wait, sla_violations, end_queue_length
        # Higher is better for: patients_completed
        improved_findings: list[str] = []
        worsened_findings: list[str] = []

        if comp_significant and mean_delta_comp >= 0.1:
            improved_findings.append(f"Discharges (+{abs(mean_delta_comp):.1f})")
        elif comp_significant and mean_delta_comp <= -0.1:
            worsened_findings.append(f"Discharges (-{abs(mean_delta_comp):.1f})")

        if wait_significant and mean_delta_wait <= -0.1:
            improved_findings.append(f"Completed avg wait (-{abs(mean_delta_wait):.1f}m)")
        elif wait_significant and mean_delta_wait >= 0.1:
            worsened_findings.append(f"Completed avg wait (+{mean_delta_wait:.1f}m)")

        if sla_significant and mean_delta_sla <= -0.1:
            improved_findings.append(f"SLA breaches (-{abs(mean_delta_sla):.1f})")
        elif sla_significant and mean_delta_sla >= 0.1:
            worsened_findings.append(f"SLA breaches (+{mean_delta_sla:.1f})")

        if queue_significant and mean_delta_queue <= -0.1:
            improved_findings.append(f"End queue length (-{abs(mean_delta_queue):.1f} waiting)")
        elif queue_significant and mean_delta_queue >= 0.1:
            worsened_findings.append(f"End queue length (+{mean_delta_queue:.1f} waiting)")

        if censored_wait_significant and mean_delta_censored_wait <= -0.1:
            improved_findings.append(f"Censoring-aware wait (-{abs(mean_delta_censored_wait):.1f}m)")
        elif censored_wait_significant and mean_delta_censored_wait >= 0.1:
            worsened_findings.append(f"Censoring-aware wait (+{mean_delta_censored_wait:.1f}m)")

        total_waiting = fork_context["total_waiting"]
        bottleneck_info = fork_context.get("bottleneck")

        # 1. Empty queue check: ALWAYS show only the "nothing to relieve" message
        if total_waiting == 0:
            msg_type = "empty_queue"
            message_text = "No patients are waiting right now, so added capacity has nothing to relieve. Try a surge or a longer horizon."

        # 2. Check if all applied changes are to unrouted resources (e.g. SURGERY)
        elif applied_changes and all(c.get("no_demand") for c in applied_changes):
            msg_type = "no_demand"
            message_text = "No patients use this resource. Surgery has no patient demand in this simulation model, so adding capacity here will not affect wait times or throughput."

        # 3. Directional classification when effects are present
        elif improved_findings and worsened_findings:
            msg_type = "mixed"
            message_text = (
                f"Mixed operational effect: {', '.join(improved_findings)} improved, but {', '.join(worsened_findings)} worsened."
            )
            # Add clinical explanation if completed wait rose due to backlog clearing
            if wait_significant and mean_delta_wait >= 0.1 and (comp_significant or queue_significant or censored_wait_significant):
                message_text += " Note: Completed avg wait rose because added capacity allowed long-waiting queued patients to finally complete treatment (clearing right-censored backlog)."

        elif improved_findings and not worsened_findings:
            msg_type = "improvement"
            detailed = []
            if wait_significant and abs(mean_delta_wait) >= 0.1:
                detailed.append(f"-{abs(mean_delta_wait):.1f} min wait time [{format_p_value(p_val_wait)}]")
            if comp_significant and abs(mean_delta_comp) >= 0.1:
                detailed.append(f"+{abs(mean_delta_comp):.1f} discharges ({mean_comp_a:.1f} -> {mean_comp_b:.1f}) [{format_p_value(p_val_comp)}]")
            if queue_significant and abs(mean_delta_queue) >= 0.1:
                detailed.append(f"-{abs(mean_delta_queue):.1f} in end queue [{format_p_value(p_val_queue)}]")
            if sla_significant and abs(mean_delta_sla) >= 0.1:
                detailed.append(f"-{abs(mean_delta_sla):.1f} SLA breaches [{format_p_value(p_val_sla)}]")
            detail_str = f" ({'; '.join(detailed)})" if detailed else ""
            message_text = f"Statistically significant improvement: {', '.join(improved_findings)} improved across replications{detail_str}."

        elif worsened_findings and not improved_findings:
            msg_type = "worse"
            message_text = f"Operational degradation: {', '.join(worsened_findings)} worsened across replications."

        # 4. Null result (no measurable change on wait, discharges, or SLA)
        else:
            msg_type = "not_bottleneck"
            if not bottleneck_info or bottleneck_info.get("department") == "NONE":
                message_text = "No measurable change detected across replications under current patient load."
            else:
                bn_dept = bottleneck_info["department"]
                bn_res = bottleneck_info["resource"]
                bn_label = f"{bn_dept} {bn_res.capitalize()}"

                # Compare on (department, resource_type) consistently
                bn_targeted = [c for c in applied_changes if c["department"] == bn_dept and c["resource"] == bn_res]
                non_bn_targeted = [c for c in applied_changes if not (c["department"] == bn_dept and c["resource"] == bn_res)]

                if bn_targeted and not non_bn_targeted:
                    # ONLY bottleneck was targeted, but no measurable difference
                    message_text = f"No measurable change. {bn_label} is the bottleneck, but adding +{bn_targeted[0]['delta']} capacity did not yield a statistically significant change over {horizon_minutes} min."
                elif bn_targeted and non_bn_targeted:
                    # Mixed deltas: some target the bottleneck, some don't
                    targeted_names, _, _ = _format_resource_list(bn_targeted)
                    non_targeted_names, _, nt_action = _format_resource_list(non_bn_targeted)
                    t_target = "targets" if len(bn_targeted) == 1 else "target"
                    message_text = f"No measurable change. Staged {targeted_names} {t_target} the bottleneck, but {non_targeted_names} {nt_action}; secondary constraints or duration prevented measurable queue relief."
                elif non_bn_targeted:
                    non_targeted_names, verb, _ = _format_resource_list(non_bn_targeted)
                    message_text = f"No measurable change. {non_targeted_names} {verb} the bottleneck; {bn_label} is."
                else:
                    message_text = f"No measurable change. Added resource isn't the bottleneck; {bn_label} is."

                if 1 <= total_waiting <= 5 and horizon_minutes <= 60:
                    message_text += f" With only {total_waiting} waiting and a {horizon_minutes}-minute horizon, even the right fix may show a small effect. If the improvement is hard to see, use Emergency Surge to build a larger queue, or go to 120m or 240m."

        wait_zero_var = bool(ci_wait_95[0] == 0 and ci_wait_95[1] == 0 and mean_delta_wait == 0)
        cw_zero_var = bool(ci_censored_wait_95[0] == 0 and ci_censored_wait_95[1] == 0 and mean_delta_censored_wait == 0)
        queue_zero_var = bool(ci_queue_95[0] == 0 and ci_queue_95[1] == 0 and mean_delta_queue == 0)
        comp_zero_var = bool(ci_comp_95[0] == 0 and ci_comp_95[1] == 0 and mean_delta_comp == 0)
        sla_zero_var = bool(ci_sla_95[0] == 0 and ci_sla_95[1] == 0 and mean_delta_sla == 0)

        return {
            "horizon_minutes": horizon_minutes,
            "replications": replications,
            "adjustments": raw_adjustments,
            "applied_changes": applied_changes,
            "strategy_override": strategy_override,
            "fork_context": fork_context,
            "baseline": {
                "average_wait_minutes": mean_wait_a,
                "censoring_aware_wait_minutes": mean_censored_wait_a,
                "p90_wait_minutes": mean_p90_a,
                "end_queue_length": mean_queue_a,
                "sla_violations": mean_sla_a,
                "patients_completed": mean_comp_a,
                "utilization": fork_context["resource_utilization"],
            },
            "counterfactual": {
                "average_wait_minutes": mean_wait_b,
                "censoring_aware_wait_minutes": mean_censored_wait_b,
                "p90_wait_minutes": mean_p90_b,
                "end_queue_length": mean_queue_b,
                "sla_violations": mean_sla_b,
                "patients_completed": mean_comp_b,
                "utilization": fork_context["resource_utilization"],
            },
            "delta": {
                "wait_minutes": mean_delta_wait,
                "censoring_aware_wait_minutes": mean_delta_censored_wait,
                "p90_wait_minutes": mean_delta_p90,
                "end_queue_length": mean_delta_queue,
                "wait_change_percent": pct_wait_change,
                "sla_violations": mean_delta_sla,
                "patients_completed": mean_delta_comp,
            },
            "statistical_summary": {
                "replications": replications,
                "mean_delta_wait": mean_delta_wait,
                "ci_wait_95": ci_wait_95,
                "p_value_wait": round(p_val_wait, 4),
                "p_value_wait_formatted": format_p_value(p_val_wait),
                "wait_significant": wait_significant,

                "mean_delta_censored_wait": mean_delta_censored_wait,
                "ci_censored_wait_95": ci_censored_wait_95,
                "p_value_censored_wait": round(p_val_censored_wait, 4),
                "p_value_censored_wait_formatted": format_p_value(p_val_censored_wait),
                "censored_wait_significant": censored_wait_significant,

                "mean_delta_queue": mean_delta_queue,
                "ci_queue_95": ci_queue_95,
                "p_value_queue": round(p_val_queue, 4),
                "p_value_queue_formatted": format_p_value(p_val_queue),
                "queue_significant": queue_significant,

                "mean_delta_comp": mean_delta_comp,
                "ci_comp_95": ci_comp_95,
                "p_value_comp": round(p_val_comp, 4),
                "p_value_comp_formatted": format_p_value(p_val_comp),
                "comp_significant": comp_significant,

                "mean_delta_sla": mean_delta_sla,
                "ci_sla_95": ci_sla_95,
                "p_value_sla": round(p_val_sla, 4),
                "p_value_sla_formatted": format_p_value(p_val_sla),
                "sla_significant": sla_significant,

                "is_significant": is_significant,
                "zero_variance": {
                    "wait": wait_zero_var,
                    "censored_wait": cw_zero_var,
                    "queue": queue_zero_var,
                    "comp": comp_zero_var,
                    "sla": sla_zero_var,
                },
                "holm_bonferroni": {
                    "adj_p_wait": adj_p_wait,
                    "adj_p_comp": adj_p_comp,
                    "adj_p_sla": adj_p_sla,
                    "adj_p_censored_wait": adj_p_cw,
                    "adj_p_queue": adj_p_queue,
                },
            },
            "message": {
                "type": msg_type,
                "text": message_text,
            },
        }
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass
