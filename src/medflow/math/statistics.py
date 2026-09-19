"""Rigorous statistical comparison engine for simulation experiments."""
from __future__ import annotations
import math
from typing import Sequence
import numpy as np
import logging

logger = logging.getLogger("medflow.statistics")

try:
    from scipy import stats
    HAS_SCIPY = True
    STATISTICS_BACKEND = "scipy"
except ImportError:
    stats = None
    HAS_SCIPY = False
    STATISTICS_BACKEND = "closed_form_fallback"
    logger.warning("Scipy is not installed; statistical routines falling back to closed-form approximations.")

def clean_paired_samples(
    a: Sequence[float | None], b: Sequence[float | None]
) -> tuple[np.ndarray, np.ndarray]:
    """Extract valid numeric pairs, dropping any pair with a missing/null value."""
    valid_a: list[float] = []
    valid_b: list[float] = []
    for x, y in zip(a, b):
        if x is not None and y is not None and not math.isnan(x) and not math.isnan(y):
            valid_a.append(float(x))
            valid_b.append(float(y))
    return np.array(valid_a, dtype=float), np.array(valid_b, dtype=float)

def paired_ttest(
    a: Sequence[float | None], b: Sequence[float | None]
) -> dict[str, float | int]:
    """Calculate paired two-sided t-test between two aligned replication arrays."""
    arr_a, arr_b = clean_paired_samples(a, b)
    n = len(arr_a)
    if n < 2:
        return {"t_stat": 0.0, "p_value": 1.0, "n_pairs": n}
    diff = arr_a - arr_b
    std_diff = float(np.std(diff, ddof=1))
    if std_diff == 0.0:
        return {"t_stat": 0.0, "p_value": 1.0 if np.mean(diff) == 0.0 else 0.0, "n_pairs": n}
    if HAS_SCIPY and stats is not None:
        res = stats.ttest_rel(arr_a, arr_b)
        p_val = float(res.pvalue) if not math.isnan(res.pvalue) else 1.0
        t_val = float(res.statistic) if not math.isnan(res.statistic) else 0.0
        return {"t_stat": t_val, "p_value": p_val, "n_pairs": n}
    else:
        mean_diff = float(np.mean(diff))
        se_diff = std_diff / math.sqrt(n)
        t_val = mean_diff / se_diff
        z = abs(t_val)
        p_val = 2.0 * (1.0 - 0.5 * (1.0 + math.erf(z / math.sqrt(2.0))))
        return {"t_stat": round(t_val, 4), "p_value": round(p_val, 6), "n_pairs": n}

def wilcoxon_signed_rank(
    a: Sequence[float | None], b: Sequence[float | None]
) -> dict[str, float | int]:
    """Calculate Wilcoxon signed-rank test on paired differences."""
    arr_a, arr_b = clean_paired_samples(a, b)
    diff = arr_a - arr_b
    non_zero_diff = diff[diff != 0]
    n = len(non_zero_diff)
    if n < 5:
        # Wilcoxon requires sufficient non-zero differences
        return {"statistic": 0.0, "p_value": 1.0, "n_pairs": len(arr_a)}
    if HAS_SCIPY and stats is not None:
        try:
            res = stats.wilcoxon(arr_a, arr_b, zero_method="wilcox")
            return {
                "statistic": float(res.statistic),
                "p_value": float(res.pvalue) if not math.isnan(res.pvalue) else 1.0,
                "n_pairs": len(arr_a),
            }
        except Exception:
            return {"statistic": 0.0, "p_value": 1.0, "n_pairs": len(arr_a)}
    return {"statistic": 0.0, "p_value": 1.0, "n_pairs": len(arr_a)}

def cohens_d(a: Sequence[float | None], b: Sequence[float | None]) -> float:
    """Calculate Cohen's d for paired samples: mean(d) / sd(d)."""
    arr_a, arr_b = clean_paired_samples(a, b)
    if len(arr_a) < 2:
        return 0.0
    diff = arr_a - arr_b
    s_d = float(np.std(diff, ddof=1))
    if s_d == 0.0:
        return 0.0
    return float(np.mean(diff) / s_d)

def bootstrap_ci_paired(
    a: Sequence[float | None],
    b: Sequence[float | None],
    n_boot: int = 2000,
    ci: float = 0.95,
    seed: int = 42,
    method: str = "percentile",
) -> dict[str, float | str | int]:
    """Empirical bootstrap confidence interval on paired difference (a - b)."""
    arr_a, arr_b = clean_paired_samples(a, b)
    n = len(arr_a)
    if n == 0:
        return {
            "ci_lower": 0.0,
            "ci_upper": 0.0,
            "ci_level": ci,
            "method": method,
            "n_boot": n_boot,
        }
    diff = arr_a - arr_b
    if n == 1 or np.all(diff == diff[0]):
        val = float(diff[0])
        return {
            "ci_lower": val,
            "ci_upper": val,
            "ci_level": ci,
            "method": method,
            "n_boot": n_boot,
        }

    rng = np.random.default_rng(seed)
    # Generate bootstrap index matrix (n_boot, n)
    indices = rng.integers(0, n, size=(n_boot, n))
    boot_means = np.mean(diff[indices], axis=1)

    alpha = 1.0 - ci
    lower_pct = (alpha / 2.0) * 100.0
    upper_pct = (1.0 - alpha / 2.0) * 100.0

    ci_lower = float(np.percentile(boot_means, lower_pct))
    ci_upper = float(np.percentile(boot_means, upper_pct))

    return {
        "ci_lower": round(ci_lower, 4),
        "ci_upper": round(ci_upper, 4),
        "ci_level": ci,
        "method": method,
        "n_boot": n_boot,
    }

def holm_bonferroni(p_values: Sequence[float]) -> list[float]:
    """Holm-Bonferroni step-down family-wise error rate adjustment.
    
    Ensures monotonicity: adjusted p-value is never lower than preceding adjusted p.
    """
    m = len(p_values)
    if m == 0:
        return []
    if m == 1:
        return [min(1.0, float(p_values[0]))]

    # Sort indices by original p-value ascending
    indexed = sorted(enumerate(p_values), key=lambda x: x[1])
    adjusted: list[tuple[int, float]] = []
    cum_max = 0.0

    for rank, (orig_idx, p) in enumerate(indexed):
        # Multiplier is (m - rank)
        factor = m - rank
        raw_adj = p * factor
        cum_max = max(cum_max, raw_adj)
        cum_max = min(1.0, cum_max)
        adjusted.append((orig_idx, cum_max))

    # Restore original ordering
    adjusted.sort(key=lambda x: x[0])
    return [round(p, 6) for _, p in adjusted]

def paired_summary(
    treatment: Sequence[float | None],
    baseline: Sequence[float | None],
    baseline_name: str = "fifo",
    seed: int = 42,
) -> dict:
    """Complete paired statistics dictionary prior to multi-hypothesis correction."""
    arr_t, arr_b = clean_paired_samples(treatment, baseline)
    n_pairs = len(arr_t)
    if n_pairs == 0:
        return {
            "baseline_name": baseline_name,
            "n_pairs": 0,
            "mean_diff": 0.0,
            "cohens_d": 0.0,
            "p_value_raw": 1.0,
            "p_value_holm": 1.0,
            "is_significant": False,
            "bootstrap_ci": {
                "ci_lower": 0.0,
                "ci_upper": 0.0,
                "ci_level": 0.95,
                "method": "percentile",
                "n_boot": 2000,
            },
        }

    diff = arr_t - arr_b
    mean_diff = float(np.mean(diff))
    ttest_res = paired_ttest(arr_t, arr_b)
    p_raw = float(ttest_res["p_value"])
    c_d = cohens_d(arr_t, arr_b)
    boot = bootstrap_ci_paired(arr_t, arr_b, n_boot=2000, seed=seed)

    return {
        "baseline_name": baseline_name,
        "n_pairs": n_pairs,
        "mean_diff": round(mean_diff, 4),
        "cohens_d": round(c_d, 4),
        "p_value_raw": round(p_raw, 6),
        "p_value_holm": round(p_raw, 6), # to be updated after multi-comparison
        "is_significant": False,
        "bootstrap_ci": boot,
    }
