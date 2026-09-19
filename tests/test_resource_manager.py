import threading
from medflow.core.models import Department,DepartmentType,Resource,ResourceType
from medflow.core.resource_manager import ResourceManager
def test_last_bed_is_atomic():
 dep=Department(name=DepartmentType.ER,resource_pools={ResourceType.BED:[Resource(id="b",type=ResourceType.BED,department=DepartmentType.ER)]}); manager=ResourceManager({DepartmentType.ER:dep}); results=[]
 threads=[threading.Thread(target=lambda:results.append(manager.reserve(ResourceType.BED,DepartmentType.ER))) for _ in range(2)]
 [t.start() for t in threads]; [t.join() for t in threads]
 assert sum(item is not None for item in results)==1
def test_reserve_all_rolls_back():
 dep=Department(name=DepartmentType.ER,resource_pools={ResourceType.BED:[Resource(id="b",type=ResourceType.BED,department=DepartmentType.ER)]}); manager=ResourceManager({DepartmentType.ER:dep})
 assert manager.reserve_all([ResourceType.BED,ResourceType.DOCTOR],DepartmentType.ER) is None
 assert manager.reserve(ResourceType.BED,DepartmentType.ER) is not None
