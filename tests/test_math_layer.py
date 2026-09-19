from datetime import datetime, timezone
from medflow.core.models import DepartmentType, Patient, ResourceType, Urgency
from medflow.core.strategies import SimulationContext
from medflow.math.markov_chain import expected_steps_to_absorption, transition_matrix
from medflow.math.mdp_policy import MDPOptimalStrategy
from medflow.math.monte_carlo import aggregate, run_replications
from medflow.math.queueing import erlang_b, erlang_c, littles_law_check
from medflow.utils.config_loader import load_config
def test_markov_chain_absorbs_and_queueing_is_bounded():
 config=load_config(); steps=expected_steps_to_absorption(transition_matrix(config["math"]["markov_transition"]))
 assert steps["WAITING"] > 0 and steps["IN_TREATMENT"] > 0
 stable=erlang_c(1/60, 1/20, 4); assert 0 <= stable["P_wait"] <= 1 and stable["expected_wait"] >= 0
 assert 0 <= erlang_b(1/60,1/20,3) <= 1 and littles_law_check(10,2,5)
def test_mdp_converges_and_batch_is_deterministic():
 strategy=MDPOptimalStrategy(); assert strategy.result.iterations <= 200 and strategy.result.delta < 1e-6
 now=datetime.now(timezone.utc); patient=Patient(id="x",name="x",arrival_time=now,wait_start=now,urgency=Urgency.CRITICAL,department_needed=DepartmentType.ER,resource_requirements=[ResourceType.BED])
 assert strategy.score(patient,now,SimulationContext({"CRITICAL":100},1,1,60,{})) > 0
 config=load_config(); seeds=[3,4,5]; assert aggregate(run_replications("mdp_optimal",config,seeds=seeds,duration=100)) == aggregate(run_replications("mdp_optimal",config,seeds=seeds,duration=100))
