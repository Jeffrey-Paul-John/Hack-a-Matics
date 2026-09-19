import sys
sys.path.insert(0, "src")
from medflow.simulation.engine import SimulationEngine
from medflow.simulation.counterfactual import run_what_if_comparison
from medflow.utils.config_loader import load_config

cfg = load_config("config/config.yaml")
engine = SimulationEngine(cfg, seed=42)
engine.run(90)

res = run_what_if_comparison(
    engine,
    cfg,
    horizon_minutes=60,
    resource_adjustments={"GENERAL": {"DOCTOR": 4}},
    replications=10
)

print("Baseline:", res["baseline"])
print("Counterfactual:", res["counterfactual"])
print("Delta:", res["delta"])
print("Statistical summary:", res["statistical_summary"])
print("Message:", res["message"])
