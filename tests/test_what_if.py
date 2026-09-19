"""Comprehensive automated tests for What-If counterfactual sandbox.

Tests requirements:
(a) Delta applied to fork only (forked resource manager capacity is baseline + 2, live engine unchanged).
(b) Stressed state shows non-zero, correctly signed improvement when adding bottleneck resource.
(c) Empty-queue state yields 'nothing to relieve' honest message.
(d) Live engine is never mutated.
"""
from medflow.core.models import DepartmentType, ResourceType
from medflow.simulation.engine import SimulationEngine
from medflow.simulation.counterfactual import run_what_if_comparison
from medflow.simulation.scenario_controller import ScenarioController
from medflow.utils.config_loader import load_config


def test_delta_applied_to_fork_only_and_normalized():
    """Verify capacity delta is applied to fork with synonym normalization, while live engine is unchanged."""
    cfg = load_config("config/config.yaml")
    engine = SimulationEngine(cfg, seed=42)
    engine.run(60)

    er_nurses_before = len(engine.departments[DepartmentType.ER].resource_pools[ResourceType.NURSE])
    assert er_nurses_before == 8

    # Apply +2 nurses using lowercase / synonym strings: {"emergency": {"nurses": 2}}
    result = run_what_if_comparison(
        current_engine=engine,
        config=cfg,
        horizon_minutes=60,
        resource_adjustments={"emergency": {"nurses": 2}},
        replications=5,
    )

    # 1. Live engine must be completely unchanged
    er_nurses_after = len(engine.departments[DepartmentType.ER].resource_pools[ResourceType.NURSE])
    assert er_nurses_after == er_nurses_before == 8

    # 2. Result must report applied changes showing department, resource, baseline -> counterfactual (+delta)
    applied = result["applied_changes"]
    assert len(applied) == 1
    assert applied[0]["department"] == "ER"
    assert applied[0]["resource"] == "NURSE"
    assert applied[0]["baseline"] == 8
    assert applied[0]["counterfactual"] == 10
    assert applied[0]["delta"] == 2
    assert applied[0]["display"] == "ER Nurses: 8 -> 10 (+2)"


def test_empty_queue_state_yields_nothing_to_relieve_message_and_none_bottleneck():
    """Verify that an unconstrained empty queue yields honest 'nothing to relieve' message and bottleneck='none'."""
    cfg = load_config("config/config.yaml")
    engine = SimulationEngine(cfg, seed=42)
    # At t=0, queue is empty
    assert sum(len(d.patient_queue) for d in engine.departments.values()) == 0

    result = run_what_if_comparison(
        current_engine=engine,
        config=cfg,
        horizon_minutes=30,
        resource_adjustments={"ER": {"NURSE": 2}},
        replications=5,
    )

    assert result["fork_context"]["total_waiting"] == 0
    # Requirement 6: Bottleneck = "none" when total_waiting == 0
    assert result["fork_context"]["bottleneck"] is None
    # Requirement 1: With an empty queue, show only the "nothing to relieve" message
    assert result["message"]["type"] == "empty_queue"
    assert "No patients are waiting right now" in result["message"]["text"]
    assert "added capacity has nothing to relieve" in result["message"]["text"]


def test_baseline_and_scenario_at_t0_are_identical():
    """Requirement 3: Verify that fork is identical to live at t=0 and CRN arrivals match per seed."""
    cfg = load_config("config/config.yaml")
    engine = SimulationEngine(cfg, seed=42)

    # Run what-if comparison with NO adjustments at t=0
    result = run_what_if_comparison(
        current_engine=engine,
        config=cfg,
        horizon_minutes=60,
        resource_adjustments={},
        replications=5,
    )

    # Baseline and scenario must be strictly identical across all metrics
    assert result["delta"]["wait_minutes"] == 0.0
    assert result["delta"]["patients_completed"] == 0.0
    assert result["delta"]["sla_violations"] == 0.0
    assert result["baseline"]["patients_completed"] == result["counterfactual"]["patients_completed"]
    assert result["baseline"]["average_wait_minutes"] == result["counterfactual"]["average_wait_minutes"]


def test_contradictory_banner_is_never_produced():
    """Requirement 1: Verify that banner never contradicts itself when adjusting bottleneck resource."""
    cfg = load_config("config/config.yaml")
    engine = SimulationEngine(cfg, seed=42)
    engine.run(90)

    # At t=90, doctors are the bottleneck
    res_bn = run_what_if_comparison(
        current_engine=engine,
        config=cfg,
        horizon_minutes=30,
        resource_adjustments={"GENERAL": {"DOCTOR": 1}},
        replications=5,
    )

    msg = res_bn["message"]["text"]
    # Must never say "X isn't the bottleneck; X is"
    assert not ("GENERAL Doctor isn't the bottleneck; GENERAL Doctor is" in msg)


def test_surgery_warns_no_patients_use_resource():
    """Requirement 4: Check that Surgery doctor adjustments warn 'no patients use this resource'."""
    cfg = load_config("config/config.yaml")
    engine = SimulationEngine(cfg, seed=42)
    engine.run(90)

    result = run_what_if_comparison(
        current_engine=engine,
        config=cfg,
        horizon_minutes=60,
        resource_adjustments={"SURGERY": {"DOCTOR": 2}},
        replications=5,
    )

    assert result["applied_changes"][0]["no_demand"] is True
    assert result["message"]["type"] == "no_demand"
    assert "No patients use this resource" in result["message"]["text"]


def test_discharges_improvement_reported_as_significant():
    """Requirement 2: Throughput improvement (e.g. 5.1 -> 7.6 discharges) must be reported as significant, not 'no effect'."""
    cfg = load_config("config/config.yaml")
    engine = SimulationEngine(cfg, seed=42)
    engine.run(90)

    result = run_what_if_comparison(
        current_engine=engine,
        config=cfg,
        horizon_minutes=120,
        resource_adjustments={"GENERAL": {"DOCTOR": 4}},
        replications=10,
    )

    # Discharges must be reported as positive finding with 95% CI
    assert result["message"]["type"] == "significant"
    assert "discharges" in result["message"]["text"]


def test_stressed_state_shows_improvement_adding_bottleneck_resource():
    """A stressed queue state shows a non-zero, correctly signed improvement when expanding bottleneck."""
    cfg = load_config("config/config.yaml")
    engine = SimulationEngine(cfg, seed=42)
    engine.run(90)

    # In stressed state at t=90, doctors are bottlenecks (ER Doctor and GENERAL Doctor at 100% utilization)
    result = run_what_if_comparison(
        current_engine=engine,
        config=cfg,
        horizon_minutes=120,
        resource_adjustments={"ER": {"DOCTOR": 4}},
        replications=10,
    )

    # Verify queue exists at fork time
    assert result["fork_context"]["total_waiting"] > 0
    assert result["fork_context"]["bottleneck"] is not None

    # Adding bottleneck capacity shows non-zero, correctly signed improvement
    delta = result["delta"]
    assert delta["wait_minutes"] < 0.0  # Wait time strictly decreases
    assert delta["patients_completed"] >= 0  # Discharges increase or remain steady
    assert result["statistical_summary"]["is_significant"] is True
    assert result["statistical_summary"]["ci_wait_95"][1] < 0.0  # 95% CI strictly below zero
    assert result["message"]["type"] == "significant"
    assert "reduction" in result["message"]["text"]


def test_live_engine_is_never_mutated():
    """Ensure clock, queues, departures, and metrics of live engine remain strictly immutable."""
    cfg = load_config("config/config.yaml")
    engine = SimulationEngine(cfg, seed=42)
    engine.run(90)

    clock_snap = engine.clock.now
    metrics_snap = engine.metrics.summary()
    queue_counts_snap = {k: len(v.patient_queue) for k, v in engine.departments.items()}

    run_what_if_comparison(
        current_engine=engine,
        config=cfg,
        horizon_minutes=120,
        resource_adjustments={"emergency": {"nurses": 4}, "icu": {"beds": 2}},
        strategy_override="mdp_optimal",
        replications=5,
    )

    # Assert exact immutability
    assert engine.clock.now == clock_snap
    assert engine.metrics.summary()["patients_completed"] == metrics_snap["patients_completed"]
    assert engine.metrics.summary()["average_wait_minutes"] == metrics_snap["average_wait_minutes"]
    assert {k: len(v.patient_queue) for k, v in engine.departments.items()} == queue_counts_snap


def test_multiple_non_bottleneck_resources_grammar():
    """Verify grammar: multiple non-bottleneck resources use plural 'and' and 'aren't the bottleneck'."""
    cfg = load_config("config/config.yaml")
    engine = SimulationEngine(cfg, seed=42)
    engine.run(90)  # In this state, doctors are bottleneck

    result = run_what_if_comparison(
        current_engine=engine,
        config=cfg,
        horizon_minutes=30,
        resource_adjustments={"ER": {"NURSE": 1}, "ICU": {"NURSE": 1}},
        replications=5,
    )

    msg = result["message"]["text"]
    # Grammar requirement: must say "ER Nurses and ICU Nurses aren't the bottleneck"
    assert "ER Nurses and ICU Nurses aren't the bottleneck" in msg
    assert "isn't the bottleneck" not in msg


def test_zero_variance_flags_and_small_queue_guidance():
    """Verify zero_variance tracking and small baseline queue tip."""
    cfg = load_config("config/config.yaml")
    engine = SimulationEngine(cfg, seed=42)
    engine.run(45)  # low queue state (~1-3 waiting)

    waiting = sum(len(d.patient_queue) for d in engine.departments.values())

    result = run_what_if_comparison(
        current_engine=engine,
        config=cfg,
        horizon_minutes=30,
        resource_adjustments={"ER": {"BED": 1}},
        replications=5,
    )

    stat = result["statistical_summary"]
    assert "zero_variance" in stat
    assert isinstance(stat["zero_variance"]["wait"], bool)
    assert isinstance(stat["zero_variance"]["comp"], bool)
    assert isinstance(stat["zero_variance"]["sla"], bool)

    if 1 <= waiting <= 5:
        msg = result["message"]["text"]
        assert "With only" in msg
        assert "minute horizon, even the right fix may show a small effect" in msg
        assert "Emergency Surge" in msg

