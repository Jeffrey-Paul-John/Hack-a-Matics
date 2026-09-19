"""Verify waiting time mathematics and in-place strategy switching."""
from medflow.simulation.engine import SimulationEngine
from medflow.utils.config_loader import load_config
from medflow.core.models import PatientStatus


def test_waiting_time_stops_at_treatment_start():
    cfg = load_config("config/config.yaml")
    engine = SimulationEngine(cfg, seed=42)
    # Step through simulation to complete some treatments
    engine.run(180)
    summary = engine.metrics.summary()
    assert summary["patients_completed"] > 0
    # Average wait minutes should be purely queue delay
    assert summary["average_wait_minutes"] >= 0
    assert summary["average_treatment_minutes"] > 0

    # Ensure every discharged patient has both wait and treatment recorded
    for record in engine.metrics.completed:
        assert "wait_minutes" in record
        assert "treatment_minutes" in record
        assert record["total_minutes"] == round(record["wait_minutes"] + record["treatment_minutes"], 2)


def test_strategy_switch_preserves_runtime_state():
    cfg = load_config("config/config.yaml")
    engine = SimulationEngine(cfg, seed=42, strategy="urgency_only")
    engine.run(60)

    clock_before = engine.clock.now
    seq_before = engine.sequence
    departures_before = len(engine.departures)

    # In-place switch to resource_aware
    engine.switch_strategy("resource_aware")

    # Clock and sequence must not reset to 0
    assert engine.clock.now == clock_before
    assert engine.sequence == seq_before
    assert len(engine.departures) == departures_before
    assert engine.allocator.engine.strategy.__class__.__name__ == "ResourceAwareStrategy"
