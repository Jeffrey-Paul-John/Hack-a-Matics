"""Headless MedFlow demo runner."""
import argparse
from medflow.reporting.report_generator import ReportGenerator
from medflow.simulation.engine import SimulationEngine
from medflow.utils.config_loader import load_config

parser = argparse.ArgumentParser(description="Run headless MedFlow clinical simulation")
parser.add_argument("--config", type=str, default="config/config.yaml", help="Path to config YAML")
parser.add_argument("--seed", type=int, default=None, help="Root random seed (overrides config)")
parser.add_argument("--duration", type=int, default=None, help="Simulation duration in minutes (overrides config)")
parser.add_argument("--strategy", type=str, default=None, help="Triage strategy name (overrides config)")
args = parser.parse_args()

cfg = load_config(args.config)
seed = args.seed if args.seed is not None else cfg.get("seed", 42)
duration = args.duration if args.duration is not None else cfg.get("simulation_duration_minutes", 480)
strategy = args.strategy if args.strategy is not None else cfg.get("priority", {}).get("strategy", "resource_aware")

engine = SimulationEngine(cfg, seed, strategy)
engine.run(duration)
report = ReportGenerator(engine)
print(report.console())
report.export()
