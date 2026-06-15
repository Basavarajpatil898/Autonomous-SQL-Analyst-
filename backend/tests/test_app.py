import unittest

from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.core.errors import QueryValidationError
from app.main import app
from app.services.query_pipeline import AutonomousQueryService
from app.services.visualization import build_result_metadata, choose_visualization


class ApiSmokeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_root_endpoint(self) -> None:
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("query_endpoint", response.json())

    def test_health_endpoint(self) -> None:
        response = self.client.get("/api/v1/health")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "ok")
        self.assertIn("ollama_model", body)


class QueryHelperTests(unittest.TestCase):
    def test_prepare_sql_rejects_mutating_queries(self) -> None:
        service = AutonomousQueryService(get_settings())
        with self.assertRaises(QueryValidationError):
            service._prepare_sql("DELETE FROM orders", max_rows=10)

    def test_visualization_prefers_pie_for_small_category_numeric_result(self) -> None:
        rows = [
            {"category": "Software", "revenue": 1200.0},
            {"category": "Services", "revenue": 900.0},
        ]
        metadata = build_result_metadata(["category", "revenue"], rows, truncated=False)
        chart = choose_visualization(rows, metadata)
        self.assertTrue(chart.enabled)
        self.assertEqual(chart.chart_type, "pie")


if __name__ == "__main__":
    unittest.main()
