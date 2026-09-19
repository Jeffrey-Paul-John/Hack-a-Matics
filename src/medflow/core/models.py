"""Pydantic domain objects used throughout the simulator."""
from __future__ import annotations
from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field

class Urgency(str, Enum):
    CRITICAL = "CRITICAL"; HIGH = "HIGH"; MODERATE = "MODERATE"; LOW = "LOW"

class ResourceType(str, Enum):
    BED = "BED"; ICU_BED = "ICU_BED"; OT = "OT"; DOCTOR = "DOCTOR"; NURSE = "NURSE"; AMBULANCE = "AMBULANCE"

class DepartmentType(str, Enum):
    ER = "ER"; ICU = "ICU"; SURGERY = "SURGERY"; GENERAL = "GENERAL"; PEDIATRIC = "PEDIATRIC"; CARDIAC = "CARDIAC"

class ResourceStatus(str, Enum):
    AVAILABLE = "AVAILABLE"; OCCUPIED = "OCCUPIED"; MAINTENANCE = "MAINTENANCE"; OUT_OF_SERVICE = "OUT_OF_SERVICE"

class PatientStatus(str, Enum):
    WAITING = "WAITING"; IN_TREATMENT = "IN_TREATMENT"; DISCHARGED = "DISCHARGED"; ICU_PENDING = "ICU_PENDING"

class Patient(BaseModel):
    """A validated patient record; resource ownership prevents ambiguous allocation."""
    id: str; name: str; arrival_time: datetime; urgency: Urgency
    department_needed: DepartmentType | str; resource_requirements: list[ResourceType | str]
    wait_start: datetime; status: PatientStatus = PatientStatus.WAITING
    assigned_resources: dict[ResourceType | str, str] = Field(default_factory=dict)
    priority_score: float = 0.0

class Resource(BaseModel):
    """A single reservable hospital asset with at most one assigned patient."""
    id: str; type: ResourceType | str; department: DepartmentType | str
    status: ResourceStatus = ResourceStatus.AVAILABLE; assigned_to: Optional[str] = None

class Department(BaseModel):
    """Department-local pools and queue; ordering remains the priority engine's job."""
    name: DepartmentType | str; resource_pools: dict[ResourceType | str, list[Resource]] = Field(default_factory=dict)
    patient_queue: list[Patient] = Field(default_factory=list)

class AllocationEvent(BaseModel):
    """Audit event emitted for every allocation decision, including skips."""
    patient_id: str; timestamp: datetime; allocated: bool; reason: str; score: float

