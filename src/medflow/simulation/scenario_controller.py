"""Controlled scenario injections for demonstrations."""
from __future__ import annotations
from ..core.models import ResourceStatus, ResourceType
class ScenarioController:
    """Applies explicit operational shocks without embedding them in API handlers."""
    def __init__(self, engine): self.engine = engine
    def trigger_surge(self, multiplier: float) -> None:
        """Raise future arrival intensity for an emergency demand scenario."""
        for key in self.engine.config["arrival_rates_per_hour"]: self.engine.config["arrival_rates_per_hour"][key] *= multiplier
    def shortage(self, kind: ResourceType, pct: float) -> int:
        """Remove a deterministic percentage of eligible resources from service."""
        resources = [r for d in self.engine.departments.values() for r in d.resource_pools.get(kind, []) if r.status == ResourceStatus.AVAILABLE]
        count = round(len(resources) * pct)
        for resource in resources[:count]: resource.status = ResourceStatus.OUT_OF_SERVICE
        return count
    def fail_resource(self, resource_id: str) -> bool:
        """Take one known resource offline for a failure demonstration."""
        for d in self.engine.departments.values():
            for pool in d.resource_pools.values():
                for r in pool:
                    if r.id == resource_id: r.status = ResourceStatus.MAINTENANCE; return True
        return False
