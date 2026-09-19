from medflow.simulation.engine import SimulationEngine
from medflow.utils.config_loader import load_config
def test_seeded_run_is_deterministic_and_bounded():
 a=SimulationEngine(load_config(),7); b=SimulationEngine(load_config(),7); a.run(180); b.run(180)
 assert a.metrics.summary()==b.metrics.summary()
 assert all(0<=value<=100 for value in a.metrics.summary()["utilization"].values())
