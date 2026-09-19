"""Unit tests for the Common Experiment Runner."""
from medflow.utils.config_loader import load_config
from medflow.simulation.experiment_runner import run_experiment, compute_config_hash

def test_experiment_runner_basic_and_censoring():
    config = load_config()
    seeds = [101, 102, 103]
    policies = ["fifo", "wait_aware"]

    result = run_experiment(
        config=config,
        seeds=seeds,
        horizon_minutes=180,
        warmup_minutes=30,
        policies=policies,
        baseline_policy="fifo",
    )

    assert result["engine_version"] == "1.2.0"
    assert len(result["seeds"]) == 3
    assert result["is_low_sample_size"] is True # 3 < 20
    assert result["config_hash"] == compute_config_hash(config)
    assert "fifo" in result["summaries"]
    assert "wait_aware" in result["summaries"]

    # Verify per-replication metrics
    for policy in policies:
        reps = result["summaries"][policy]["replications"]
        assert len(reps) == 3
        for rep in reps:
            assert "n_censored" in rep
            assert "mean_wait_minutes" in rep
            assert "target_4hr_met_percent" in rep
            assert "icu_blocking_probability" in rep
            assert "wait_by_acuity" in rep
            # n_censored + n_discharged == n_episodes
            assert rep["n_discharged"] + rep["n_censored"] == rep["n_episodes"]

    # Verify paired comparison
    assert "wait_aware" in result["paired_comparisons"]
    paired = result["paired_comparisons"]["wait_aware"]
    assert paired["baseline_name"] == "fifo"
    assert "p_value_raw" in paired
    assert "p_value_holm" in paired
    assert "cohens_d" in paired
    assert "bootstrap_ci" in paired
    assert paired["bootstrap_ci"]["method"] == "percentile"
    assert "is_significant" in paired
    assert isinstance(paired["is_significant"], bool)

def test_config_hash_excludes_ephemeral_fields():
    config1 = load_config()
    config2 = load_config()
    config2["exported_at"] = "2026-09-19T23:59:00Z"
    config2["run_id"] = "test-run-123"

    assert compute_config_hash(config1) == compute_config_hash(config2)

def test_benchmark_api_endpoint():
    from fastapi.testclient import TestClient
    from medflow.api.main import app

    client = TestClient(app)
    response = client.post(
        "/experiment/benchmark",
        json={
            "seeds": [42, 43],
            "replications": 2,
            "horizon_minutes": 120,
            "warmup_minutes": 20,
            "policies": ["fifo", "wait_aware"],
            "baseline_policy": "fifo",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "headline" in data
    assert "summaries" in data
    assert "paired_comparisons" in data
    assert "acuity_breakdown" in data
