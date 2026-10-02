"""Comprehensive unit tests for the Planner Agent system and tool suite."""

import os
import sys
import unittest

# Add package root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from models import StepStatus, TaskStep, ExecutionPlan
from planner import TaskPlanner
from agent import AutonomousTaskRunner
from tools import (
    calculate_math_expression,
    search_knowledge_base,
    fetch_web_data,
    read_sandboxed_file,
    write_sandboxed_file,
    manage_memory_store,
    summarize_content,
    BASE_WORKSPACE_DIR,
)


class TestAgenticTools(unittest.TestCase):
    """Test safety and correctness of the tool suite."""

    def test_calculate_math_valid(self):
        # Basic arithmetic
        res = calculate_math_expression.invoke({"expression": "(10 + 5) * 2 - 4 / 2"})
        self.assertIn("28", res)

        # Powers and roots
        res_pow = calculate_math_expression.invoke({"expression": "sqrt(144) + 2 ** 3"})
        self.assertIn("20", res_pow)

        # CAGR formula test
        res_cagr = calculate_math_expression.invoke({"expression": "(200 / 100) ** (1 / 2) - 1"})
        self.assertIn("0.414214", res_cagr)

    def test_calculate_math_safety_blocks_code_execution(self):
        # Prevent eval / exec / imports
        res_import = calculate_math_expression.invoke({"expression": "__import__('os').system('ls')"})
        self.assertIn("Error", res_import)

        res_exec = calculate_math_expression.invoke({"expression": "exec('x = 1')"})
        self.assertIn("Error", res_exec)

        res_attr = calculate_math_expression.invoke({"expression": "().__class__.__bases__[0].__subclasses__()"})
        self.assertIn("Error", res_attr)

    def test_knowledge_base_search(self):
        res = search_knowledge_base.invoke({"query": "CAGR", "category": "finance"})
        self.assertIn("Compound Annual Growth Rate", res)

        res_safety = search_knowledge_base.invoke({"query": "Trustabl", "category": "safety"})
        self.assertIn("LC-003", res_safety)

    def test_fetch_web_data_security_rejections(self):
        # Unapproved service key
        res_unapproved = fetch_web_data.invoke({"service_name": "malicious_internal_service"})
        self.assertIn("not in the approved service list", res_unapproved)

        # Approved service request
        res_approved = fetch_web_data.invoke({"service_name": "status"})
        self.assertIn("Success", res_approved)

    def test_file_sandbox_isolation(self):
        # Writing and reading within sandbox
        write_res = write_sandboxed_file.invoke({"file_name": "test_doc.txt", "content": "Hello Sandboxed World"})
        self.assertIn("Success", write_res)

        read_res = read_sandboxed_file.invoke({"file_name": "test_doc.txt"})
        self.assertIn("Hello Sandboxed World", read_res)

        # Traversal protection
        traversal_res = read_sandboxed_file.invoke({"file_name": "../../etc/passwd"})
        # Basename resolves it to passwd in workspace, which doesn't exist
        self.assertIn("does not exist", traversal_res)

    def test_memory_store_lifecycle(self):
        # Set
        manage_memory_store.invoke({"action": "set", "key": "test_key", "value": "test_value_123"})
        # Get
        get_res = manage_memory_store.invoke({"action": "get", "key": "test_key"})
        self.assertIn("test_value_123", get_res)
        # List
        list_res = manage_memory_store.invoke({"action": "list", "key": ""})
        self.assertIn("test_key", list_res)
        # Delete
        manage_memory_store.invoke({"action": "delete", "key": "test_key"})
        get_after = manage_memory_store.invoke({"action": "get", "key": "test_key"})
        self.assertIn("not found", get_after)

    def test_summarize_content(self):
        content = "First major finding.\nSecond key milestone.\nThird critical metric.\nFourth detail."
        summary = summarize_content.invoke({"text": content, "max_points": 2})
        self.assertIn("First major finding.", summary)
        self.assertIn("Second key milestone.", summary)
        self.assertNotIn("Fourth detail.", summary)


class TestPlanningAndExecution(unittest.TestCase):
    """Test planning decomposition, step advancement, and replanning."""

    def setUp(self):
        self.planner = TaskPlanner()
        self.runner = AutonomousTaskRunner(planner=self.planner)

    def test_plan_generation_and_board(self):
        goal = "Calculate annual growth rate and summarize results"
        plan = self.planner.create_initial_plan(goal)
        self.assertGreater(len(plan.steps), 0)
        self.assertEqual(plan.current_step_index, 0)
        self.assertFalse(plan.is_completed)

        rendered = self.planner.render_plan_board(plan)
        self.assertIn("Execution Plan", rendered)
        self.assertIn("Step 1", rendered)

    def test_dynamic_replanning_on_failure(self):
        goal = "Execute mission critical task"
        plan = self.planner.create_initial_plan(goal)
        original_step_count = len(plan.steps)

        failed_step = plan.steps[0]
        revised_plan = self.planner.replan_on_failure(plan, failed_step, "Connection timeout to data source")

        self.assertEqual(len(revised_plan.steps), original_step_count + 1)
        self.assertEqual(revised_plan.steps[0].status, StepStatus.FAILED)
        self.assertIn("Fallback recovery", revised_plan.steps[1].description)

    def test_autonomous_task_runner_execution(self):
        goal = "Calculate 5-year CAGR growth from $100k to $250k"
        outcome = self.runner.run_task(goal=goal, verbose=False)

        self.assertTrue(outcome["is_completed"])
        self.assertGreater(len(outcome["steps"]), 0)
        self.assertGreater(len(outcome["traces"]), 0)
        self.assertIn("Successfully executed", outcome["summary"])


if __name__ == "__main__":
    unittest.main()
