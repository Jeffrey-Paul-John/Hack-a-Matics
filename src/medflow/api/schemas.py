"""HTTP boundary models."""
from pydantic import BaseModel, Field
class StartRequest(BaseModel): seed: int = 42; strategy: str = "resource_aware"
class RunRequest(BaseModel): duration: int = Field(default=60, ge=1, le=10000)
class SurgeRequest(BaseModel): multiplier: float = Field(default=2, gt=1, le=10)
class ShortageRequest(BaseModel): resource_type: str; percent: float = Field(default=.25, gt=0, le=1)
class FailureRequest(BaseModel): resource_id: str
class StrategyRequest(BaseModel): strategy: str
class ChatRequest(BaseModel): message: str; language: str = "en"
