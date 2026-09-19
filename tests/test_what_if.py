"""Test What-If counterfactual scenario comparison."""
from medflow.simulation.engine import SimulationEngine
from medflow.simulation.counterfactual import run_what_if_comparison
from medflow.utils.config_loader import load_config


def test_what_if_comparison_runs_without_altering_live_engine():
    cfg = load_config("config/config.yaml")
    engine = SimulationEngine(cfg, seed=42)
    engine.run(120)

    clock_before = engine.clock.now
    completed_before = engine.metrics.summary()["patients_completed"]

    # Run What-If adding 2 nurses in ER for 60 minutes
    result = run_what_if_comparison(
        engine,
        cfg,
        horizon_minutes=60,
        resource_adjustments={"ER": {"NURSE": 2}},
    )

    # Live engine clock and state must NOT be modified
    assert engine.clock.now == clock_before
    assert engine.metrics.summary()["patients_completed"] == completed_before

    # Verify What-If payload structure
    assert "baseline" in result
    assert "counterfactual" in result
    assert "delta" in result
    assert "wait_minutes" in result["delta"]
    assert "sla_violations" in result["delta"]
    assert result["adjustments"] == {"ER": {"NURSE": 2}}
