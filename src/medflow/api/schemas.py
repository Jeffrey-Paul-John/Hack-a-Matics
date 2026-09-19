from typing import Any
from pydantic import BaseModel, Field, model_validator

class StartRequest(BaseModel): seed: int = 42; strategy: str = "resource_aware"
class RunRequest(BaseModel): duration: int = Field(default=60, ge=1, le=10000)
class SurgeRequest(BaseModel): multiplier: float = Field(default=2, gt=1, le=10)
class ShortageRequest(BaseModel): resource_type: str; percent: float = Field(default=.25, gt=0, le=1)
class FailureRequest(BaseModel): resource_id: str
class StrategyRequest(BaseModel): strategy: str
class ChatRequest(BaseModel): message: str; language: str = "en"

class WhatIfRequest(BaseModel):
    horizon_minutes: int = Field(default=60, ge=15, le=480)
    resource_adjustments: dict[str, dict[str, int]] = Field(default_factory=dict)
    strategy: str | None = None
    replications: int = Field(default=20, ge=1, le=50)

    @model_validator(mode="before")
    @classmethod
    def handle_aliases(cls, values: Any) -> Any:
        if isinstance(values, dict):
            if "adjustments" in values and "resource_adjustments" not in values:
                values["resource_adjustments"] = values.get("adjustments") or {}
            if "strategy_override" in values and "strategy" not in values:
                values["strategy"] = values.get("strategy_override")
        return values

class ExperimentRequest(BaseModel):
    seeds: list[int] | None = None
    replications: int = Field(default=30, ge=2, le=100)
    horizon_minutes: int = Field(default=480, ge=60, le=1440)
    warmup_minutes: int = Field(default=60, ge=0, le=480)
    policies: list[str] = Field(
        default_factory=lambda: ["fifo", "random", "static_priority", "wait_aware", "mdp_optimal"]
    )
    baseline_policy: str = "fifo"
