from datetime import datetime,timezone
from medflow.core.allocator import Allocator
from medflow.core.models import *
from medflow.core.priority_engine import PriorityEngine
from medflow.core.resource_manager import ResourceManager
from medflow.core.strategies import SimulationContext,UrgencyOnlyStrategy
def test_higher_priority_is_allocated_first():
 now=datetime.now(timezone.utc); resource=Resource(id="bed",type=ResourceType.BED,department=DepartmentType.ER)
 low=Patient(id="low",name="l",arrival_time=now,wait_start=now,urgency=Urgency.LOW,department_needed=DepartmentType.ER,resource_requirements=[ResourceType.BED])
 high=Patient(id="high",name="h",arrival_time=now,wait_start=now,urgency=Urgency.HIGH,department_needed=DepartmentType.ER,resource_requirements=[ResourceType.BED])
 dep=Department(name=DepartmentType.ER,resource_pools={ResourceType.BED:[resource]},patient_queue=[low,high]); manager=ResourceManager({DepartmentType.ER:dep}); engine=PriorityEngine(UrgencyOnlyStrategy(),SimulationContext({"CRITICAL":100,"HIGH":60,"MODERATE":30,"LOW":10},1,1,60,{}))
 Allocator(manager,engine).tick(now); assert high.status==PatientStatus.IN_TREATMENT and low.status==PatientStatus.WAITING
