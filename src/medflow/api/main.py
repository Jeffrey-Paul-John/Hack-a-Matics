"""FastAPI entry point and lightweight route wiring with multi-tenant session isolation."""
from __future__ import annotations
import os
from dotenv import load_dotenv

load_dotenv()

from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from ..core.models import ResourceType
from ..simulation.engine import SimulationEngine
from ..simulation.scenario_controller import ScenarioController
from ..simulation.persistence import save_snapshot, load_snapshot
from ..simulation.counterfactual import run_what_if_comparison
from ..simulation.experiment_runner import run_experiment
from ..utils.config_loader import load_config
from .schemas import (
    ChatRequest,
    ExperimentRequest,
    FailureRequest,
    RunRequest,
    ShortageRequest,
    StartRequest,
    StrategyRequest,
    SurgeRequest,
    WhatIfRequest,
    TokenResponse,
    UserLoginRequest,
    UserRegisterRequest,
    UserResponse,
)
from .chat_service import answer_clinical_query, detect_input_language
from .session_manager import SessionManager
from .websocket_manager import ConnectionManager
from ..math.monte_carlo import aggregate, run_replications
from ..math.validation import benchmarks, run_validation_suite
from .tts_router import router as tts_router, store_chat_reply
from ..db import dispatch_supabase_sync, check_supabase_health

app = FastAPI(title="PulseGrid API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_origin_regex=r".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(tts_router)

# Operator accounts registry for authentication
OPERATOR_ACCOUNTS = {
    "admin@medflow.health": "medflow-demo",
    "admin@pulsegrid.dev": "pulsegrid-demo",
}

@app.post("/v1/auth/login", response_model=TokenResponse)
async def auth_login(payload: UserLoginRequest):
    email = payload.email.strip().lower()
    expected = OPERATOR_ACCOUNTS.get(email)
    if expected is not None:
        if payload.password != expected:
            raise HTTPException(status_code=401, detail="invalid email or password")
    elif len(payload.password) < 8:
        raise HTTPException(status_code=401, detail="invalid email or password")
    else:
        OPERATOR_ACCOUNTS[email] = payload.password

    import base64, json
    token_str = base64.b64encode(json.dumps({"email": email, "role": "clinical_operator"}).encode()).decode()
    return TokenResponse(access_token=f"medflow_jwt_{token_str}")


@app.post("/v1/auth/register", response_model=UserResponse)
async def auth_register(payload: UserRegisterRequest):
    email = payload.email.strip().lower()
    if len(payload.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long")
    if email in OPERATOR_ACCOUNTS:
        raise HTTPException(status_code=409, detail="email already registered")
    OPERATOR_ACCOUNTS[email] = payload.password
    return UserResponse(id=len(OPERATOR_ACCOUNTS), email=email, role=payload.role)


@app.get("/v1/auth/me", response_model=UserResponse)
async def auth_me(request: Request):
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.replace("Bearer ", "").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing or invalid authentication token")

    email = "admin@medflow.health"
    role = "clinical_operator"
    if token.startswith("medflow_jwt_"):
        try:
            import base64, json
            decoded = json.loads(base64.b64decode(token.replace("medflow_jwt_", "")).decode())
            email = decoded.get("email", email)
            role = decoded.get("role", role)
        except Exception:
            pass
    return UserResponse(id=1, email=email, role=role)


config = load_config()
sessions = SessionManager(lambda: load_config())
sockets = ConnectionManager()

# Resume default session from snapshot if available on disk
SNAPSHOT_FILE = "data/sim_snapshot.json"
if os.path.exists(SNAPSHOT_FILE):
    try:
        sessions.default_engine = load_snapshot(SNAPSHOT_FILE, config)
    except Exception:
        pass


def _extract_session_id(request: Request | None) -> str:
    """Extract session token from request headers, query parameters, or cookies."""
    if not request:
        return "default"
    token = (
        request.headers.get("X-Session-ID")
        or request.query_params.get("session_id")
        or request.cookies.get("session_id")
        or "default"
    )
    return token.strip() or "default"


def current(request: Request | None = None) -> SimulationEngine:
    """Ensure operations target the caller's dedicated isolated simulation session."""
    session_id = _extract_session_id(request)
    return sessions.get_or_create(session_id)


# Expose global engine reference for backward compatibility with external scripts/tests
@property
def engine():
    return sessions.default_engine


@app.post("/simulation/start")
async def start(body: StartRequest = StartRequest(), request: Request = None):
    """Create a seeded simulation through the domain service."""
    session_id = _extract_session_id(request)
    new_engine = sessions.reset_session(session_id, body.seed, body.strategy)
    state = new_engine.state()
    await sockets.broadcast(state, session_id)
    dispatch_supabase_sync(session_id, new_engine)
    return state


@app.post("/simulation/step")
async def step(request: Request = None):
    session_id = _extract_session_id(request)
    engine_inst = current(request)
    state = engine_inst.step()
    await sockets.broadcast(state, session_id)
    dispatch_supabase_sync(session_id, engine_inst)
    return state


@app.post("/simulation/run")
async def run(body: RunRequest, request: Request = None):
    session_id = _extract_session_id(request)
    engine_inst = current(request)
    state = engine_inst.run(body.duration)
    await sockets.broadcast(state, session_id)
    dispatch_supabase_sync(session_id, engine_inst)
    return state


@app.get("/v1/supabase/health")
def supabase_health():
    """Diagnostic check for live Supabase cloud connectivity."""
    return check_supabase_health()


@app.post("/simulation/reset")
async def reset(request: Request = None):
    session_id = _extract_session_id(request)
    sessions.reset_session(session_id)
    return {"reset": True, "session_id": session_id}


@app.get("/simulation/state")
def state(request: Request = None):
    return current(request).state()


@app.get("/metrics/utilization")
def utilization(request: Request = None):
    return current(request).metrics.summary()["utilization"]


@app.get("/metrics/wait-times")
def waits(request: Request = None):
    return current(request).metrics.summary()["wait_by_urgency"]


@app.post("/scenario/surge")
def surge(body: SurgeRequest, request: Request = None):
    ScenarioController(current(request)).trigger_surge(body.multiplier)
    return {"applied": True}


@app.post("/scenario/shortage")
def shortage(body: ShortageRequest, request: Request = None):
    return {"removed": ScenarioController(current(request)).shortage(ResourceType(body.resource_type), body.percent)}


@app.get("/meta/config")
@app.get("/meta/enums")
def meta_config():
    """Expose dynamic clinical configuration and enums as single source of truth."""
    return {
        "departments": list(config["capacities"].keys()),
        "resource_types": sorted(list({t for caps in config["capacities"].values() for t in caps})),
        "strategies": config.get("strategies", ["urgency_only", "wait_aware", "resource_aware", "mdp_optimal"]),
        "urgency_levels": list(config["urgency_weights"].keys()),
        "capacities": config["capacities"],
    }


@app.post("/chat")
def chat(body: ChatRequest, request: Request = None):
    """Clinical copilot answering queries using live simulation telemetry only."""
    detected = detect_input_language(body.message)
    effective_lang = detected if (body.language == "en" and detected) else body.language
    reply = answer_clinical_query(current(request), body.message, effective_lang)
    session_id = _extract_session_id(request)
    msg_id = store_chat_reply(reply, session_id=session_id)
    return {"reply": reply, "language": effective_lang, "message_id": msg_id}


@app.post("/scenario/fail-resource")
def failure(body: FailureRequest, request: Request = None):
    success = ScenarioController(current(request)).fail_resource(body.resource_id)
    if not success:
        raise HTTPException(404, f"Resource '{body.resource_id}' does not exist among active simulation assets")
    return {"failed": True, "resource_id": body.resource_id}


@app.post("/strategy/switch")
def switch(body: StrategyRequest, request: Request = None):
    """Hot-swap allocation strategy in-place without restarting simulation."""
    engine_inst = current(request)
    engine_inst.switch_strategy(body.strategy)
    return engine_inst.state()


@app.post("/scenario/what-if")
def what_if(body: WhatIfRequest, request: Request = None):
    """Evaluate counterfactual operational scenario without modifying active simulation."""
    engine_inst = current(request)
    sess_config = engine_inst.config if hasattr(engine_inst, "config") else config
    return run_what_if_comparison(
        current_engine=engine_inst,
        config=sess_config,
        horizon_minutes=body.horizon_minutes,
        resource_adjustments=body.resource_adjustments,
        strategy_override=body.strategy,
        replications=body.replications,
    )


@app.post("/experiment/benchmark")
def run_benchmark(body: ExperimentRequest, request: Request = None):
    """Run multi-policy multi-seed benchmark experiment using Common Random Numbers (CRN)."""
    sess_config = current(request).config if request else config
    if body.seeds:
        seeds = body.seeds
    else:
        rep_count = body.replications or 30
        seeds = [1000 + i * 17 for i in range(rep_count)]

    return run_experiment(
        config=sess_config,
        seeds=seeds,
        horizon_minutes=body.horizon_minutes,
        warmup_minutes=body.warmup_minutes,
        policies=body.policies,
        baseline_policy=body.baseline_policy,
    )


@app.post("/sim/save")
def save_sim(request: Request = None):
    """Save snapshot of current simulation state to disk."""
    session_id = _extract_session_id(request)
    engine_inst = current(request)
    path = f"data/snapshots/{session_id}_snapshot.json" if session_id != "default" else SNAPSHOT_FILE
    saved_path = save_snapshot(engine_inst, path)
    return {"saved": True, "path": saved_path, "clock": engine_inst.clock.now.isoformat()}


@app.post("/sim/resume")
def resume_sim(request: Request = None):
    """Resume simulation state from disk snapshot."""
    session_id = _extract_session_id(request)
    path = f"data/snapshots/{session_id}_snapshot.json" if session_id != "default" else SNAPSHOT_FILE
    if not os.path.exists(path):
        raise HTTPException(404, f"No snapshot found at '{path}'")
    loaded = load_snapshot(path, config)
    if session_id == "default":
        sessions.default_engine = loaded
    else:
        sessions.sessions[session_id] = (loaded, datetime.now(timezone.utc).timestamp())
    return {"resumed": True, "clock": loaded.clock.now.isoformat()}


_cached_comparison: dict | None = None


@app.get("/strategy/compare")
@app.post("/strategy/compare")
def compare(replications: int | None = None, force: bool = False):
    global _cached_comparison
    reps = replications or config.get("math", {}).get("comparison_replications", 30)
    if not force and _cached_comparison is not None and _cached_comparison.get("_reps") == reps:
        return _cached_comparison["data"]

    strategies = config.get("strategies", ["urgency_only", "wait_aware", "resource_aware", "mdp_optimal"])
    duration = config.get("simulation_duration_minutes", 480)

    with ThreadPoolExecutor(max_workers=min(4, len(strategies))) as executor:
        futures = {name: executor.submit(run_replications, name, config, reps, None, duration) for name in strategies}
        res = {name: aggregate(future.result()) for name, future in futures.items()}

    _cached_comparison = {"_reps": reps, "data": res}
    return res


@app.get("/math/benchmarks")
def math_benchmarks():
    return benchmarks(config)


@app.get("/math/validation")
def math_validation(request: Request = None):
    return run_validation_suite(config, current(request).metrics.summary())


@app.websocket("/ws/live")
async def live(socket: WebSocket, session_id: str = "default"):
    await sockets.connect(socket, session_id)
    try:
        while True:
            msg = await socket.receive_text()
            if msg == "ping":
                await socket.send_text("pong")
    except WebSocketDisconnect:
        sockets.disconnect(socket)


_user_onboarding: dict[str, dict] = {}


@app.get("/users/me/onboarding/{tour_id}/status")
def onboarding_status(tour_id: str):
    record = _user_onboarding.get(tour_id)
    return {
        "tour_id": tour_id,
        "completed": record is not None,
        "completed_at": record.get("completed_at") if record else None,
    }


@app.post("/users/me/onboarding/{tour_id}/complete")
def onboarding_complete(tour_id: str):
    completed_at = datetime.now(timezone.utc).isoformat()
    _user_onboarding[tour_id] = {"completed_at": completed_at}
    return {
        "tour_id": tour_id,
        "completed": True,
        "completed_at": completed_at,
    }
