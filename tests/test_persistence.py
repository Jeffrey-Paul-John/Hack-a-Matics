"""Test simulation persistence: save and resume."""
import os
from medflow.simulation.engine import SimulationEngine
from medflow.simulation.persistence import save_snapshot, load_snapshot
from medflow.utils.config_loader import load_config


def test_save_and_resume_roundtrip(tmp_path):
    cfg = load_config("config/config.yaml")
    engine = SimulationEngine(cfg, seed=42)
    engine.run(120)

    # Save to temp file
    snapshot_path = str(tmp_path / "sim_test.json")
    save_snapshot(engine, snapshot_path)
    assert os.path.exists(snapshot_path)

    # Load from file
    resumed = load_snapshot(snapshot_path, cfg)

    # Compare core state
    assert resumed.clock.now == engine.clock.now
    assert resumed.sequence == engine.sequence
    assert len(resumed.departures) == len(engine.departures)
    assert resumed.metrics.summary()["patients_completed"] == engine.metrics.summary()["patients_completed"]
    assert resumed.metrics.summary()["average_wait_minutes"] == engine.metrics.summary()["average_wait_minutes"]

    # Continue running the resumed engine
    resumed.step()
    assert resumed.clock.now > engine.clock.now
