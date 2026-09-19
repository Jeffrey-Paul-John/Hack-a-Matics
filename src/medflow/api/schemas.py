"""HTTP boundary models."""
from pydantic import BaseModel, Field
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
