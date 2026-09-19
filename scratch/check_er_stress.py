import sys
sys.path.insert(0, "src")
from medflow.simulation.engine import SimulationEngine
from medflow.simulation.scenario_controller import ScenarioController
from medflow.simulation.counterfactual import run_what_if_comparison
from medflow.utils.config_loader import load_config

cfg = load_config("config/config.yaml")
# Let's test from a state where ER is stressed and doctors are added
engine = SimulationEngine(cfg, seed=42)
engine.run(60)

# At 60 min, let's see ER queue:
print("ER queue:", [p.id for p in engine.departments["ER"].patient_queue])

res = run_what_if_comparison(
    engine,
    cfg,
    horizon_minutes=60,
    resource_adjustments={"ER": {"DOCTOR": 4, "BED": 4, "NURSE": 4}},
    replications=5
)
print("60min Horizon:")
print("Baseline:", res["baseline"])
print("Counterfactual:", res["counterfactual"])
print("Delta:", res["delta"])
