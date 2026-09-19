"""Compare policies under the same seeded workload."""
import argparse
from medflow.math.monte_carlo import aggregate, run_replications
from medflow.utils.config_loader import load_config

parser = argparse.ArgumentParser(description="Monte Carlo comparison across clinical triage strategies")
parser.add_argument("--config", type=str, default="config/config.yaml", help="Path to config YAML")
parser.add_argument("--replications", type=int, default=None, help="Number of replications per strategy")
parser.add_argument("--duration", type=int, default=None, help="Horizon duration per replication in minutes")
parser.add_argument("--seed", type=int, default=None, help="Root random seed")
args = parser.parse_args()

cfg = load_config(args.config)
if args.seed is not None:
    cfg["seed"] = args.seed

replications = args.replications or cfg.get("math", {}).get("comparison_replications", 30)
duration = args.duration or cfg.get("simulation_duration_minutes", 480)
strategies = cfg.get("strategies", ["urgency_only", "wait_aware", "resource_aware", "mdp_optimal"])

print(f"Running Monte Carlo evaluation: {replications} replications per strategy (duration: {duration} min, root seed: {cfg.get('seed', 42)})...")
for name in strategies:
    summary = aggregate(run_replications(name, cfg, replications, duration=duration))
    wait = summary["average_wait_minutes"]
    util = summary["utilization_percent"]
    sla = summary["sla_violations"]
    print(f"{name:16} mean wait={wait['mean']:6.1f}m [95% CI {wait['ci95'][0]:.1f}-{wait['ci95'][1]:.1f}] | util={util['mean']:5.1f}% | sla={sla['mean']:4.1f}")
