from medflow.api.main import onboarding_complete, onboarding_status

def test_onboarding_persistence_lifecycle():
    tour_id = "test-new-user-tour"
    # Initially not completed
    initial_status = onboarding_status(tour_id)
    assert initial_status["tour_id"] == tour_id
    assert initial_status["completed"] is False
    assert initial_status["completed_at"] is None

    # Mark completed
    complete_res = onboarding_complete(tour_id)
    assert complete_res["tour_id"] == tour_id
    assert complete_res["completed"] is True
    assert complete_res["completed_at"] is not None

    # Verify status reflects completion
    final_status = onboarding_status(tour_id)
    assert final_status["completed"] is True
    assert final_status["completed_at"] == complete_res["completed_at"]
