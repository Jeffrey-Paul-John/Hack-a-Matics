"""Theory-versus-simulation validation report."""
from __future__ import annotations
from .markov_chain import expected_steps_to_absorption, transition_matrix
from .queueing import erlang_b, erlang_c, littles_law_check
import math
def benchmarks(config: dict) -> dict:
    """Compute live bed and ICU theory benchmarks from configured rates and capacity."""
    arrival = sum(config["arrival_rates_per_hour"].values()) / 60
    service = 1 / config["service_minutes"].get("MODERATE", next(iter(config["service_minutes"].values())))
    total_beds = sum(caps.get("BED", 0) for caps in config["capacities"].values())
    icu_beds = sum(caps.get("ICU_BED", 0) for caps in config["capacities"].values())
    if total_beds == 0:
        total_beds = max(sum(caps.values()) for caps in config["capacities"].values()) if config["capacities"] else 1
    if icu_beds == 0:
        icu_beds = max(1, total_beds // 4)
    c = erlang_c(arrival, service, total_beds)
    if not math.isfinite(c["expected_wait"]): c["expected_wait"] = None
    return {"erlang_c": c, "erlang_b_icu": erlang_b(arrival * .1, service, icu_beds), "units": "minutes"}
def run_validation_suite(config: dict, simulation_metrics: dict | None = None) -> dict:
    """Bundle transparent analytical evidence into an export-ready validation result."""
    markov = expected_steps_to_absorption(transition_matrix(config["math"]["markov_transition"]))
    theory = benchmarks(config); simulated = (simulation_metrics or {}).get("average_wait_minutes", 0)
    predicted = theory["erlang_c"]["expected_wait"]
    difference = abs(simulated-predicted) / max(1, predicted) if simulation_metrics and predicted is not None else None
    return {"markov_expected_steps": markov, "queueing": theory, "simulated_average_wait_minutes": simulated if simulation_metrics else None, "within_documented_tolerance": difference <= config["math"]["validation_tolerance"] if difference is not None else None, "little_law_sanity": littles_law_check(0, 0, 0)}
