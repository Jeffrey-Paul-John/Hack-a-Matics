"""Absorbing Markov-chain analysis of patient flow."""
from __future__ import annotations
import numpy as np
STATES = ("WAITING", "IN_TREATMENT", "DISCHARGED", "TRANSFERRED", "ICU_ESCALATION", "DECEASED")
TRANSIENT = ("WAITING", "IN_TREATMENT", "ICU_ESCALATION")
ABSORBING = ("DISCHARGED", "TRANSFERRED", "DECEASED")
def transition_matrix(transitions: dict[str, dict[str, float]]) -> np.ndarray:
    """Build a validated state-transition matrix from readable YAML probabilities."""
    matrix = np.zeros((len(STATES), len(STATES)))
    for row, values in transitions.items():
        for column, probability in values.items(): matrix[STATES.index(row), STATES.index(column)] = probability
    for state in ABSORBING: matrix[STATES.index(state), STATES.index(state)] = 1
    if not np.allclose(matrix.sum(axis=1), 1): raise ValueError("every Markov transition row must sum to one")
    return matrix
def fundamental_matrix(matrix: np.ndarray) -> np.ndarray:
    """Return (I-Q)^-1, whose rows encode expected transient visits before absorption."""
    indices = [STATES.index(state) for state in TRANSIENT]; q = matrix[np.ix_(indices, indices)]
    return np.linalg.inv(np.eye(len(q)) - q)
def expected_steps_to_absorption(matrix: np.ndarray) -> dict[str, float]:
    """Derive expected length of stay in transition steps for every transient state."""
    visits = fundamental_matrix(matrix).sum(axis=1)
    return dict(zip(TRANSIENT, visits.tolist()))
def empirical_transition_matrix(events: list[tuple[str, str]]) -> np.ndarray:
    """Estimate transitions from observed patient state changes, preserving absorbing states."""
    counts = {state: {target: 0 for target in STATES} for state in STATES}
    for before, after in events: counts[before][after] += 1
    probabilities = {state: ({target: value / sum(row.values()) for target, value in row.items()} if sum(row.values()) else {state: 1.0}) for state,row in counts.items()}
    return transition_matrix(probabilities)
