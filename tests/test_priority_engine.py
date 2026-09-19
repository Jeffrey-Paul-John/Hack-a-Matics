from datetime import datetime, timedelta, timezone
from medflow.core.models import DepartmentType, Patient, ResourceType, Urgency
from medflow.core.strategies import SimulationContext, ResourceAwareStrategy, UrgencyOnlyStrategy, WaitAwareStrategy
def patient(urgency, wait=0):
 now=datetime(2026,1,1,tzinfo=timezone.utc); return Patient(id=urgency.value+str(wait),name="x",arrival_time=now,wait_start=now-timedelta(minutes=wait),urgency=urgency,department_needed=DepartmentType.ER,resource_requirements=[ResourceType.BED])
def test_critical_outranks_low_and_waiting_increases_score():
 context=SimulationContext({"CRITICAL":100,"HIGH":60,"MODERATE":30,"LOW":10},1.2,12,60,{"BED":.5}); now=datetime(2026,1,1,tzinfo=timezone.utc)
 for strategy in (UrgencyOnlyStrategy(),WaitAwareStrategy(),ResourceAwareStrategy()): assert strategy.score(patient(Urgency.CRITICAL),now,context)>strategy.score(patient(Urgency.LOW),now,context)
 assert WaitAwareStrategy().score(patient(Urgency.LOW,50),now,context)>WaitAwareStrategy().score(patient(Urgency.LOW),now,context)
