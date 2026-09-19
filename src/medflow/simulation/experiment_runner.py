"""Common Experiment Runner with Common Random Numbers (CRN) and Paired Statistics."""
from __future__ import annotations
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import hashlib
import json
import math
from typing import Any
import numpy as np

from ..core.models import DepartmentType, Patient, PatientStatus, ResourceStatus, ResourceType, Urgency
from ..math.statistics import holm_bonferroni, paired_summary
from ..simulation.engine import SimulationEngine

ENGINE_VERSION = "1.2.0"

def compute_config_hash(config: dict) -> str:
    """Compute deterministic SHA-256 hash of configuration, excluding ephemeral timestamps."""
    clean = deepcopy(config)
    for k in ("exported_at", "created_at", "timestamp", "now", "run_id", "date"):
        clean.pop(k, None)
    canonical = json.dumps(clean, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

def _run_single_replication(
    config: dict,
    seed: int,
    strategy: str,
    horizon_minutes: int,
    warmup_minutes: int,
) -> dict[str, Any]:
    """Execute one replication with arrival-based warm-up and right-censoring."""
    engine = SimulationEngine(config=config, seed=seed, strategy=strategy)
    t0 = engine.clock.now
    t_warm = t0 + timedelta(minutes=warmup_minutes)
    t_end = t0 + timedelta(minutes=horizon_minutes)

    # Run headless simulation to horizon
    engine.run(duration=horizon_minutes)

    # Harvest all patients
    # 1. Discharged
    discharged_episodes = list(engine.metrics.completed)
    # 2. Patients still in system (WAITING, IN_TREATMENT, ICU_PENDING)
    active_patients: list[Patient] = []
    for d in engine.departments.values():
        for p in d.patient_queue:
            if p.status in (PatientStatus.WAITING, PatientStatus.IN_TREATMENT, PatientStatus.ICU_PENDING):
                active_patients.append(p)

    # Filter post-warmup by arrival time
    post_warmup_episodes: list[dict] = []
    for ep in discharged_episodes:
        arr_str = ep.get("arrival_time")
        if arr_str:
            arr_dt = datetime.fromisoformat(arr_str)
            if arr_dt >= t_warm:
                post_warmup_episodes.append(ep)

    post_warmup_active: list[Patient] = [
        p for p in active_patients if p.arrival_time >= t_warm
    ]

    n_discharged = len(post_warmup_episodes)
    n_censored = len(post_warmup_active)
    n_total = n_discharged + n_censored

    # Collect wait times and total ED times
    all_waits: list[float] = []
    waits_by_acuity: dict[str, list[float]] = {
        u.value: [] for u in Urgency
    }
    ed_stays_under_4hr = 0
    icu_req_count = 0
    icu_blocked_count = 0

    # Process discharged patients
    for ep in post_warmup_episodes:
        wait = float(ep.get("wait_minutes", ep.get("actual_wait_minutes", 0.0)))
        all_waits.append(wait)
        urg = ep.get("urgency", "MODERATE")
        if urg in waits_by_acuity:
            waits_by_acuity[urg].append(wait)

        arr_dt = datetime.fromisoformat(ep["arrival_time"])
        dis_dt = datetime.fromisoformat(ep["discharge_time"])
        total_ed_stay = (dis_dt - arr_dt).total_seconds() / 60.0
        if total_ed_stay <= 240.0:
            ed_stays_under_4hr += 1

        if ep.get("icu_blocked_at_arrival", False) or ep.get("department_needed") == "ICU":
            icu_req_count += 1
            if ep.get("icu_blocked_at_arrival", False):
                icu_blocked_count += 1

    # Process censored patients
    for p in post_warmup_active:
        if p.status == PatientStatus.WAITING:
            censored_wait = (t_end - p.wait_start).total_seconds() / 60.0
        else:
            censored_wait = p.actual_wait_minutes
        
        all_waits.append(censored_wait)
        urg_val = p.urgency.value if hasattr(p.urgency, "value") else str(p.urgency)
        if urg_val in waits_by_acuity:
            waits_by_acuity[urg_val].append(censored_wait)

        stay_so_far = (t_end - p.arrival_time).total_seconds() / 60.0
        if stay_so_far <= 240.0:
            ed_stays_under_4hr += 1

        needs_icu = p.department_needed in (DepartmentType.ICU, "ICU") or any(
            r in (ResourceType.ICU_BED, "ICU_BED") for r in p.resource_requirements
        )
        if needs_icu or p.icu_blocked_at_arrival:
            icu_req_count += 1
            if p.icu_blocked_at_arrival:
                icu_blocked_count += 1

    mean_wait = float(np.mean(all_waits)) if all_waits else 0.0
    p90_wait = float(np.percentile(all_waits, 90)) if all_waits else 0.0

    eval_duration_hours = max(0.1, (horizon_minutes - warmup_minutes) / 60.0)
    throughput_per_hour = round(n_discharged / eval_duration_hours, 2)
    target_4hr_pct = round((ed_stays_under_4hr / n_total) * 100.0, 1) if n_total > 0 else 100.0
    icu_blocking_prob = round(icu_blocked_count / icu_req_count, 4) if icu_req_count > 0 else 0.0

    # Acuity wait dictionary (nullable per replication)
    acuity_waits_rep: dict[str, float | None] = {}
    for urg_key, vals in waits_by_acuity.items():
        acuity_waits_rep[urg_key] = round(float(np.mean(vals)), 2) if len(vals) > 0 else None

    return {
        "seed": seed,
        "strategy": strategy,
        "n_episodes": n_total,
        "n_discharged": n_discharged,
        "n_censored": n_censored,
        "mean_wait_minutes": round(mean_wait, 2),
        "p90_wait_minutes": round(p90_wait, 2),
        "throughput_per_hour": throughput_per_hour,
        "target_4hr_met_percent": target_4hr_pct,
        "icu_blocking_probability": icu_blocking_prob,
        "wait_by_acuity": acuity_waits_rep,
    }

def run_experiment(
    config: dict,
    seeds: list[int] | None = None,
    horizon_minutes: int = 480,
    warmup_minutes: int = 60,
    policies: list[str] | None = None,
    baseline_policy: str = "fifo",
) -> dict[str, Any]:
    """Execute multi-policy multi-seed simulation experiment using Common Random Numbers (CRN)."""
    if seeds is None:
        seeds = [1000 + i * 17 for i in range(30)]
    if policies is None:
        policies = ["fifo", "random", "static_priority", "wait_aware", "mdp_optimal"]

    if baseline_policy not in policies:
        policies = [baseline_policy] + [p for p in policies if p != baseline_policy]

    config_hash = compute_config_hash(config)
    n_replications = len(seeds)

    # 1. Execute replications across policies and seeds
    policy_replications: dict[str, list[dict[str, Any]]] = {p: [] for p in policies}

    for seed in seeds:
        for policy in policies:
            rep_res = _run_single_replication(
                config=config,
                seed=seed,
                strategy=policy,
                horizon_minutes=horizon_minutes,
                warmup_minutes=warmup_minutes,
            )
            policy_replications[policy].append(rep_res)

    # 2. Aggregate per policy
    policy_summaries: dict[str, Any] = {}
    for policy in policies:
        reps = policy_replications[policy]
        mean_waits = [r["mean_wait_minutes"] for r in reps]
        p90_waits = [r["p90_wait_minutes"] for r in reps]
        throughputs = [r["throughput_per_hour"] for r in reps]
        target_4hrs = [r["target_4hr_met_percent"] for r in reps]
        icu_blocks = [r["icu_blocking_probability"] for r in reps]
        censored_counts = [r["n_censored"] for r in reps]
        episode_counts = [r["n_episodes"] for r in reps]

        def _stats(arr: list[float]) -> dict[str, float]:
            m = float(np.mean(arr)) if arr else 0.0
            s = float(np.std(arr, ddof=1)) if len(arr) > 1 else 0.0
            se = s / math.sqrt(len(arr)) if len(arr) > 0 else 0.0
            return {
                "mean": round(m, 2),
                "std": round(s, 2),
                "ci_lower": round(m - 1.96 * se, 2),
                "ci_upper": round(m + 1.96 * se, 2),
            }

        # Aggregate wait by acuity (ignoring None)
        acuity_agg: dict[str, dict[str, float | None]] = {}
        for u in Urgency:
            u_vals = [
                r["wait_by_acuity"][u.value]
                for r in reps
                if r["wait_by_acuity"].get(u.value) is not None
            ]
            if u_vals:
                acuity_agg[u.value] = _stats(u_vals)
            else:
                acuity_agg[u.value] = {"mean": None, "std": None, "ci_lower": None, "ci_upper": None}

        policy_summaries[policy] = {
            "mean_wait_minutes": _stats(mean_waits),
            "p90_wait_minutes": _stats(p90_waits),
            "throughput_per_hour": _stats(throughputs),
            "target_4hr_met_percent": _stats(target_4hrs),
            "icu_blocking_probability": _stats(icu_blocks),
            "censored_count_mean": round(float(np.mean(censored_counts)), 1),
            "episodes_per_rep_mean": round(float(np.mean(episode_counts)), 1),
            "wait_by_acuity": acuity_agg,
            "replications": reps,
        }

    # 3. Paired comparisons vs named baseline
    baseline_reps = policy_replications[baseline_policy]
    paired_comparisons: dict[str, Any] = {}
    raw_p_values: list[float] = []
    compared_policies: list[str] = [p for p in policies if p != baseline_policy]

    for p in compared_policies:
        p_reps = policy_replications[p]
        p_means = [r["mean_wait_minutes"] for r in p_reps]
        b_means = [r["mean_wait_minutes"] for r in baseline_reps]

        pair_summary = paired_summary(
            treatment=p_means,
            baseline=b_means,
            baseline_name=baseline_policy,
        )
        paired_comparisons[p] = pair_summary
        raw_p_values.append(pair_summary["p_value_raw"])

    # Holm-Bonferroni correction across the policy mean wait comparisons
    adjusted_p = holm_bonferroni(raw_p_values)
    for p, adj_p in zip(compared_policies, adjusted_p):
        paired_comparisons[p]["p_value_holm"] = adj_p
        paired_comparisons[p]["is_significant"] = adj_p < 0.05

    # 4. Generate plain-language headline and Acuity Winner/Loser breakdown
    # Check best performing policy against baseline
    best_policy = min(
        policies,
        key=lambda x: policy_summaries[x]["mean_wait_minutes"]["mean"],
    )
    b_mean = policy_summaries[baseline_policy]["mean_wait_minutes"]["mean"]
    best_mean = policy_summaries[best_policy]["mean_wait_minutes"]["mean"]
    best_4hr = policy_summaries[best_policy]["target_4hr_met_percent"]["mean"]

    reduction_pct = round(((b_mean - best_mean) / max(0.1, b_mean)) * 100, 1)
    best_p_val = paired_comparisons.get(best_policy, {}).get("p_value_holm", 1.0)
    p_str = "p < 0.001" if best_p_val < 0.001 else f"p = {best_p_val:.3f}"

    if best_policy != baseline_policy and reduction_pct > 0:
        headline = (
            f"{best_policy.replace('_', ' ').title()} reduces overall wait by {reduction_pct}% "
            f"over {baseline_policy.upper()} ({p_str}) with {best_4hr}% 4-hour target compliance."
        )
    else:
        headline = (
            f"{baseline_policy.upper()} baseline wait is {b_mean} min with "
            f"{policy_summaries[baseline_policy]['target_4hr_met_percent']['mean']}% 4-hour compliance."
        )

    # Acuity Winner/Loser breakdown
    acuity_breakdown: dict[str, dict[str, Any]] = {}
    for u in Urgency:
        u_val = u.value
        # Compare best_policy vs baseline for this acuity
        best_u_mean = policy_summaries[best_policy]["wait_by_acuity"][u_val]["mean"]
        base_u_mean = policy_summaries[baseline_policy]["wait_by_acuity"][u_val]["mean"]

        if best_u_mean is not None and base_u_mean is not None:
            diff = round(best_u_mean - base_u_mean, 1)
            pct = round(((base_u_mean - best_u_mean) / max(0.1, base_u_mean)) * 100, 1)
            status = "improved" if diff < -1.0 else ("worsened" if diff > 1.0 else "neutral")
            acuity_breakdown[u_val] = {
                "baseline_mean": base_u_mean,
                "policy_mean": best_u_mean,
                "diff_minutes": diff,
                "pct_change": pct,
                "status": status,
            }
        else:
            acuity_breakdown[u_val] = {
                "baseline_mean": base_u_mean,
                "policy_mean": best_u_mean,
                "diff_minutes": 0.0,
                "pct_change": 0.0,
                "status": "insufficient_data",
            }

    return {
        "engine_version": ENGINE_VERSION,
        "config_hash": config_hash,
        "seeds": seeds,
        "replications_count": n_replications,
        "is_low_sample_size": n_replications < 20,
        "horizon_minutes": horizon_minutes,
        "warmup_minutes": warmup_minutes,
        "baseline_policy": baseline_policy,
        "policies": policies,
        "headline": headline,
        "acuity_breakdown": acuity_breakdown,
        "summaries": policy_summaries,
        "paired_comparisons": paired_comparisons,
    }
