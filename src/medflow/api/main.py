"""FastAPI entry point and lightweight route wiring."""
from __future__ import annotations
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from ..core.models import ResourceType
from ..simulation.engine import SimulationEngine
from ..simulation.scenario_controller import ScenarioController
from ..utils.config_loader import load_config
from .schemas import ChatRequest, FailureRequest, RunRequest, ShortageRequest, StartRequest, StrategyRequest, SurgeRequest
from .chat_service import answer_clinical_query
from .websocket_manager import ConnectionManager
from ..math.monte_carlo import aggregate, run_replications
from ..math.validation import benchmarks, run_validation_suite
app = FastAPI(title="MedFlow API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_origin_regex=r".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
config = load_config(); engine: SimulationEngine = SimulationEngine(config); sockets = ConnectionManager()
def current() -> SimulationEngine:
    """Ensure commands operate on an active simulation."""
    global engine
    if engine is None: engine = SimulationEngine(config)
    return engine
@app.post("/simulation/start")
async def start(body: StartRequest = StartRequest()):
    """Create a seeded simulation through the domain service."""
    global engine; engine = SimulationEngine(config, body.seed, body.strategy); return engine.state()
@app.post("/simulation/step")
async def step():
    state = current().step(); await sockets.broadcast(state); return state
@app.post("/simulation/run")
async def run(body: RunRequest):
    state = current().run(body.duration); await sockets.broadcast(state); return state
@app.post("/simulation/reset")
async def reset():
    global engine; engine = SimulationEngine(config); return {"reset": True}
@app.get("/simulation/state")
def state(): return current().state()
@app.get("/metrics/utilization")
def utilization(): return current().metrics.summary()["utilization"]
@app.get("/metrics/wait-times")
def waits(): return current().metrics.summary()["wait_by_urgency"]
@app.post("/scenario/surge")
def surge(body: SurgeRequest): ScenarioController(current()).trigger_surge(body.multiplier); return {"applied": True}
@app.post("/scenario/shortage")
def shortage(body: ShortageRequest): return {"removed": ScenarioController(current()).shortage(ResourceType(body.resource_type), body.percent)}
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
def chat(body: ChatRequest):
    """Clinical copilot answering queries using live simulation telemetry only."""
    return {"reply": answer_clinical_query(current(), body.message, body.language)}
@app.post("/scenario/fail-resource")
def failure(body: FailureRequest):
    success = ScenarioController(current()).fail_resource(body.resource_id)
    if not success:
        raise HTTPException(404, f"Resource '{body.resource_id}' does not exist among active simulation assets")
    return {"failed": True, "resource_id": body.resource_id}
@app.post("/strategy/switch")
def switch(body: StrategyRequest):
    global engine; old = current(); engine = SimulationEngine(config, old.seed, body.strategy); return engine.state()
from concurrent.futures import ThreadPoolExecutor

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
    with ThreadPoolExecutor(max_workers=min(len(strategies), 4)) as executor:
        futures = {name: executor.submit(run_replications, name, config, reps, None, duration) for name in strategies}
        res = {name: aggregate(future.result()) for name, future in futures.items()}

    _cached_comparison = {"_reps": reps, "data": res}
    return res
@app.get("/math/benchmarks")
def math_benchmarks(): return benchmarks(config)
@app.get("/math/validation")
def math_validation(): return run_validation_suite(config, current().metrics.summary() if engine else None)
@app.websocket("/ws/live")
async def live(socket: WebSocket):
    await sockets.connect(socket)
    try:
        while True:
            await socket.receive_text()
    except WebSocketDisconnect:
        sockets.disconnect(socket)

from datetime import datetime, timezone

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


