import sys
sys.path.insert(0, "src")
from medflow.simulation.engine import SimulationEngine
from medflow.simulation.scenario_controller import ScenarioController
from medflow.simulation.counterfactual import compute_fork_context
from medflow.utils.config_loader import load_config

cfg = load_config("config/config.yaml")
engine = SimulationEngine(cfg, seed=42)
engine.run(120)
print("At 120min:", compute_fork_context(engine))

engine.run(120)
print("At 240min:", compute_fork_context(engine))

controller = ScenarioController(engine)
controller.trigger_surge(2.5)
engine.run(60)
print("At 300min with surge:", compute_fork_context(engine))
