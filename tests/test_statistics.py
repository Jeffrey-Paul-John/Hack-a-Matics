"""Validate statistical routines against scipy and verify edge case handling."""
import numpy as np
import pytest
from scipy import stats
from medflow.math.statistics import (
    clean_paired_samples,
    paired_ttest,
    wilcoxon_signed_rank,
    cohens_d,
    bootstrap_ci_paired,
    holm_bonferroni,
    paired_summary,
)

def test_clean_paired_samples_drops_missing():
    a = [10.0, None, 15.0, 20.0, float("nan"), 25.0]
    b = [8.0, 12.0, None, 18.0, 22.0, 21.0]
    arr_a, arr_b = clean_paired_samples(a, b)
    assert len(arr_a) == 3
    assert list(arr_a) == [10.0, 20.0, 25.0]
    assert list(arr_b) == [8.0, 18.0, 21.0]

def test_paired_ttest_matches_scipy():
    rng = np.random.default_rng(123)
    a = rng.normal(50, 10, size=30).tolist()
    b = (np.array(a) + rng.normal(-2, 3, size=30)).tolist()

    res = paired_ttest(a, b)
    scipy_res = stats.ttest_rel(a, b)

    assert pytest.approx(res["t_stat"], rel=1e-5) == scipy_res.statistic
    assert pytest.approx(res["p_value"], rel=1e-5) == scipy_res.pvalue
    assert res["n_pairs"] == 30

def test_wilcoxon_matches_scipy():
    rng = np.random.default_rng(456)
    a = rng.normal(30, 5, size=25).tolist()
    b = (np.array(a) + rng.normal(1.5, 2, size=25)).tolist()

    res = wilcoxon_signed_rank(a, b)
    scipy_res = stats.wilcoxon(a, b, zero_method="wilcox")

    assert pytest.approx(res["statistic"], rel=1e-5) == scipy_res.statistic
    assert pytest.approx(res["p_value"], rel=1e-5) == scipy_res.pvalue

def test_cohens_d():
    diffs = [2.0, 4.0, 6.0, 8.0]
    # mean = 5, diff - mean = [-3, -1, 1, 3], sum sq = 20, var = 20/3, sd = sqrt(20/3) = 2.581988897
    # d = 5 / 2.581988897 = 1.93649
    a = [12.0, 14.0, 16.0, 18.0]
    b = [10.0, 10.0, 10.0, 10.0]
    d = cohens_d(a, b)
    assert pytest.approx(d, rel=1e-4) == 1.9365

def test_bootstrap_ci_paired():
    a = [20.0, 22.0, 25.0, 28.0, 30.0]
    b = [15.0, 17.0, 19.0, 22.0, 24.0]
    # diffs are all 5.0, 5.0, 6.0, 6.0, 6.0 -> mean 5.6
    res = bootstrap_ci_paired(a, b, n_boot=1000, ci=0.95, seed=42)
    assert res["ci_lower"] <= 5.6 <= res["ci_upper"]
    assert res["method"] == "percentile"

def test_holm_bonferroni_monotonicity_and_values():
    # 4 hypothesis tests with sorted raw p-values: [0.01, 0.02, 0.04, 0.05]
    # Holm step-down:
    # rank 0: p=0.01 * 4 = 0.04
    # rank 1: p=0.02 * 3 = 0.06
    # rank 2: p=0.04 * 2 = 0.08
    # rank 3: p=0.05 * 1 = 0.05 -> forced monotonicity to max(0.08, 0.05) = 0.08
    raw_p = [0.04, 0.01, 0.05, 0.02]
    adjusted = holm_bonferroni(raw_p)
    # Expected in original order:
    # 0.04 was rank 2 -> 0.08
    # 0.01 was rank 0 -> 0.04
    # 0.05 was rank 3 -> 0.08
    # 0.02 was rank 1 -> 0.06
    assert adjusted[1] == 0.04
    assert adjusted[3] == 0.06
    assert adjusted[0] == 0.08
    assert adjusted[2] == 0.08
