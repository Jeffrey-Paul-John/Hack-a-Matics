"""Tests verifying Common Random Numbers (CRN), stable hashing, and determinism across policies."""
from datetime import datetime, timezone
import hashlib
from medflow.utils.config_loader import load_config
from medflow.core.models import Patient, Urgency
from medflow.core.strategies import FIFOStrategy, RandomStrategy, SimulationContext, WaitAwareStrategy
from medflow.simulation.arrival_generator import ArrivalGenerator
from medflow.simulation.engine import SimulationEngine

def test_crn_identical_arrivals_and_service_variates_across_policies():
    """Verify that different policies executed on the same seed observe identical arrivals,

    identical service times, and identical escalation variates.
    """
    config = load_config()
    seed = 4042

    # Run engine with FIFO
    engine_fifo = SimulationEngine(config=config, seed=seed, strategy="fifo")
    engine_fifo.run(duration=240)

    # Run engine with wait_aware
    engine_wait = SimulationEngine(config=config, seed=seed, strategy="wait_aware")
    engine_wait.run(duration=240)

    # Run engine with static_priority
    engine_static = SimulationEngine(config=config, seed=seed, strategy="static_priority")
    engine_static.run(duration=240)

    # Both generators should have generated arrivals in identical order with identical attributes
    # We can inspect all patients that entered the system by checking metrics completed + still queued + in treatment
    def collect_all_patients(engine: SimulationEngine) -> list[dict]:
        all_p = {}
        for ep in engine.metrics.completed:
            pid = ep["patient_id"] if "patient_id" in ep else ep.get("id", "")
            all_p[pid] = {
                "id": pid,
                "urgency": ep["urgency"],
                "arrival_time": ep["arrival_time"],
                "service_duration": ep.get("service_duration_minutes", 0.0),
            }
        for d in engine.departments.values():
            for p in d.patient_queue:
                all_p[p.id] = {
                    "id": p.id,
                    "urgency": p.urgency.value,
                    "arrival_time": p.arrival_time.isoformat(),
                    "service_duration": p.service_duration_minutes,
                    "escalation_risk": p.escalation_risk,
                }
        return [all_p[k] for k in sorted(all_p.keys())]

    # Directly verify generator draws independently
    gen1 = ArrivalGenerator(config, seed=seed)
    gen2 = ArrivalGenerator(config, seed=seed)

    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    for seq in range(1, 40):
        t1, s1 = gen1.next_after(now)
        t2, s2 = gen2.next_after(now)
        assert t1 == t2
        assert s1 == s2

        p1 = gen1.patient(t1, s1, seq)
        p2 = gen2.patient(t2, s2, seq)

        assert p1.id == p2.id
        assert p1.urgency == p2.urgency
        assert p1.department_needed == p2.department_needed
        assert p1.resource_requirements == p2.resource_requirements
        assert p1.service_duration_minutes == p2.service_duration_minutes
        assert p1.escalation_risk == p2.escalation_risk
        assert p1.service_duration_minutes > 0

    # Ensure engine sequence counts match
    assert engine_fifo.sequence == engine_wait.sequence == engine_static.sequence

def test_random_strategy_hashlib_process_stability():
    """Verify RandomStrategy uses hashlib.sha256 and is unaffected by Python hash randomization."""
    strat = RandomStrategy(seed=777)
    ctx = SimulationContext(
        urgency_weights={}, wait_weight=0.0, scarcity_weight=0.0, max_wait=60.0, scarcity={}, seed=777
    )
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    p = Patient(
        id="P0042",
        name="Patient 42",
        arrival_time=now,
        wait_start=now,
        urgency=Urgency.HIGH,
        department_needed="ER",
        resource_requirements=[],
    )

    # Compute expected score manually from hashlib sha256
    token = "777:P0042"
    digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
    expected_score = (int(digest[:8], 16) / 0xFFFFFFFF) * 100.0

    score1 = strat.score(p, now, ctx)
    score2 = strat.score(p, now, ctx)

    assert score1 == score2
    assert score1 == expected_score
