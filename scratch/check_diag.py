import sys
sys.path.insert(0, "src")
from medflow.simulation.engine import SimulationEngine
from medflow.simulation.scenario_controller import ScenarioController
from medflow.simulation.counterfactual import run_what_if_comparison
from medflow.utils.config_loader import load_config

cfg = load_config("config/config.yaml")
engine = SimulationEngine(cfg, seed=101)
ScenarioController(engine).trigger_surge(3.5)
engine.run(180)

# Let's see what happens if horizon is longer (e.g. 240 or 360) so queue drains, or with more doctors across departments
res = run_what_if_comparison(
    engine,
    cfg,
    horizon_minutes=240,
    resource_adjustments={"ER": {"DOCTOR": 4, "BED": 4, "NURSE": 4}, "GENERAL": {"DOCTOR": 4}},
    replications=5
)

print("Baseline:", res["baseline"])
print("Counterfactual:", res["counterfactual"])
print("Delta:", res["delta"])
