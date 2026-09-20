import os
import pytest
from fastapi.testclient import TestClient
from medflow.api.main import app
from medflow.db import check_supabase_health, get_supabase_client

client = TestClient(app)

def test_supabase_health_endpoint():
    res = client.get("/v1/supabase/health")
    assert res.status_code == 200
    data = res.json()
    assert data["configured"] is True
    assert isinstance(data["connected"], bool)
    assert "https://zditonamkiltynteyodf.supabase.co" in data["url"]
    if data["connected"]:
        assert "simulation_sessions" in data["tables"]

def test_supabase_client_initialization():
    sb = get_supabase_client()
    assert sb is not None
