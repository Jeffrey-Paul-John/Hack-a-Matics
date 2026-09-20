import pytest
from fastapi.testclient import TestClient
from medflow.api.main import app

client = TestClient(app)

def test_login_demo():
    res = client.post("/v1/auth/login", json={"email": "admin@medflow.health", "password": "medflow-demo"})
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    token = data["access_token"]

    # Verify me
    me_res = client.get("/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    assert me_res.json()["email"] == "admin@medflow.health"

def test_login_invalid():
    res = client.post("/v1/auth/login", json={"email": "admin@medflow.health", "password": "wrong-password"})
    assert res.status_code == 401

def test_register_and_login():
    email = "nurse_sarah@medflow.health"
    reg_res = client.post("/v1/auth/register", json={"email": email, "password": "strongpassword123", "role": "nurse"})
    assert reg_res.status_code == 200
    assert reg_res.json()["email"] == email

    login_res = client.post("/v1/auth/login", json={"email": email, "password": "strongpassword123"})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]

    me_res = client.get("/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    assert me_res.json()["email"] == email
