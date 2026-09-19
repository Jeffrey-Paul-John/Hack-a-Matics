"""Classical M/M/c and loss-system benchmarks."""
from __future__ import annotations
import math
def erlang_c(lambda_: float, mu: float, c: int) -> dict[str, float]:
    """Return M/M/c delay probability and mean queue wait for stable offered load."""
    if lambda_ < 0 or mu <= 0 or c < 1: raise ValueError("lambda must be nonnegative; mu and c positive")
    offered, rho = lambda_ / mu, lambda_ / (c * mu)
    if rho >= 1: return {"P_wait": 1.0, "expected_wait": float("inf"), "utilization": rho}
    denominator = sum(offered**n / math.factorial(n) for n in range(c)) + offered**c / math.factorial(c) / (1-rho)
    delay = (offered**c / math.factorial(c) / (1-rho)) / denominator
    return {"P_wait": delay, "expected_wait": delay / (c * mu - lambda_), "utilization": rho}
def erlang_b(lambda_: float, mu: float, c: int) -> float:
    """Return loss probability using the stable Erlang-B recursion."""
    if lambda_ < 0 or mu <= 0 or c < 1: raise ValueError("invalid queue inputs")
    blocking = 1.0
    for n in range(1, c + 1): blocking = (lambda_ / mu * blocking) / (n + lambda_ / mu * blocking)
    return blocking
def littles_law_check(L: float, lambda_: float, W: float, tolerance: float = .15) -> bool:
    """Flag material disagreement between observed occupancy and Little's Law."""
    expected = lambda_ * W
    return abs(L - expected) <= tolerance * max(1.0, abs(expected))
