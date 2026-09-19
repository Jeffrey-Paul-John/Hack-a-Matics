"""Deterministic replication and confidence-interval tooling."""
from __future__ import annotations
from dataclasses import dataclass
from statistics import mean, stdev
import numpy as np
from ..simulation.engine import SimulationEngine
@dataclass(frozen=True)
class RunResult:
    """One seeded run's primary performance measures."""
    seed: int; average_wait: float; utilization: float; sla_violations: int
def run_replications(strategy: str, config: dict, n: int = 30, seeds: list[int] | None = None, duration: int = 480) -> list[RunResult]:
    """Run independent, reproducible copies where only the seed changes."""
    rng = np.random.default_rng(config.get("seed", 42))
    seed_list = seeds or [int(s) for s in rng.integers(1, 10_000_000, size=n)]
    return [RunResult(seed, (summary := SimulationEngine(config, seed, strategy).run(duration)["metrics"])["average_wait_minutes"], sum(summary["utilization"].values()) / max(1, len(summary["utilization"])), summary.get("sla_violations", 0)) for seed in seed_list]
def aggregate(results: list[RunResult]) -> dict:
    """Compute mean, sample deviation, and 95% t-interval for each comparison metric."""
    if not results: raise ValueError("at least one replication is required")
    critical = 2.045 if len(results) == 30 else 1.96
    def stats(values):
        deviation = stdev(values) if len(values) > 1 else 0; margin = critical * deviation / len(values)**.5
        return {"mean": round(mean(values), 3), "std_dev": round(deviation, 3), "ci95": [round(mean(values)-margin,3), round(mean(values)+margin,3)]}
    return {"n": len(results), "average_wait_minutes": stats([r.average_wait for r in results]), "utilization_percent": stats([r.utilization for r in results]), "sla_violations": stats([r.sla_violations for r in results])}
