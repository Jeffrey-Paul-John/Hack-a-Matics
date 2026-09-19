"""Atomic resource reservation with capacity guards."""
from __future__ import annotations
import threading
from .models import Department, DepartmentType, Resource, ResourceStatus, ResourceType

class ResourceManager:
    """Owns mutations to resources, making over-allocation impossible under concurrency."""
    def __init__(self, departments: dict[DepartmentType, Department]): self.departments, self._lock = departments, threading.RLock()
    def reserve(self, resource_type: ResourceType, department: DepartmentType, patient_id: str = "pending") -> Resource | None:
        """Reserve one available local resource, or return None without mutating any other pool."""
        with self._lock:
            pool = self.departments[department].resource_pools.get(resource_type, [])
            resource = next((r for r in pool if r.status == ResourceStatus.AVAILABLE), None)
            if resource is None: return None
            resource.status, resource.assigned_to = ResourceStatus.OCCUPIED, patient_id
            return resource
    def reserve_all(self, requirements: list[ResourceType], department: DepartmentType, patient_id: str = "pending") -> dict[ResourceType, Resource] | None:
        """Reserve all distinct requirements atomically; partial reservations are rolled back."""
        with self._lock:
            reserved: dict[ResourceType, Resource] = {}
            for kind in dict.fromkeys(requirements):
                resource = self.reserve(kind, department, patient_id)
                if resource is None:
                    for item in reserved.values(): item.status, item.assigned_to = ResourceStatus.AVAILABLE, None
                    return None
                reserved[kind] = resource
            return reserved
    def release(self, resource_id: str) -> bool:
        """Release a known occupied asset and report whether it was found."""
        with self._lock:
            for department in self.departments.values():
                for pool in department.resource_pools.values():
                    for resource in pool:
                        if resource.id == resource_id:
                            resource.status, resource.assigned_to = ResourceStatus.AVAILABLE, None
                            return True
        return False
    def scarcity(self, department: DepartmentType) -> dict[str, float]:
        """Return depletion ratios used only for policy scoring."""
        pools = self.departments[department].resource_pools
        return {(kind.value if hasattr(kind, "value") else str(kind)): 1 - sum(r.status == ResourceStatus.AVAILABLE for r in pool) / len(pool) for kind, pool in pools.items() if pool}


