"""Test multi-user session isolation."""
from medflow.api.session_manager import SessionManager
from medflow.utils.config_loader import load_config


def test_independent_user_sessions_do_not_interfere():
    mgr = SessionManager(lambda: load_config("config/config.yaml"))

    # User A and User B get separate engines
    engine_a = mgr.get_or_create("user-session-alice")
    engine_b = mgr.get_or_create("user-session-bob")

    assert engine_a is not engine_b

    # Alice advances her simulation by 10 events
    for _ in range(10):
        engine_a.step()

    # Bob's hospital has had 0 steps
    assert engine_a.sequence == 10
    assert engine_b.sequence == 0
    assert engine_a.clock.now > engine_b.clock.now

    # Alice resets her hospital; Bob's hospital remains untouched
    mgr.reset_session("user-session-alice", seed=99)
    fresh_alice = mgr.get_or_create("user-session-alice")
    assert fresh_alice.sequence == 0
    assert fresh_alice.seed == 99

    # Bob still has his original state
    bob = mgr.get_or_create("user-session-bob")
    assert bob.sequence == 0
    assert bob.seed == 42
