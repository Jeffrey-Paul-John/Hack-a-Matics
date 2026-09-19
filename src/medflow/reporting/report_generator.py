"""JSON and CSV performance report generation."""
from __future__ import annotations
import csv, json
from pathlib import Path
class ReportGenerator:
    """Exports transparent end-of-run metrics for demos and downstream analysis."""
    def __init__(self, engine): self.engine = engine
    def export(self, output: str = "logs/reports") -> dict:
        """Write a JSON summary and a row-oriented completion CSV, then return the summary."""
        folder = Path(output); folder.mkdir(parents=True, exist_ok=True); summary = self.engine.metrics.summary()
        (folder / "report.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
        with (folder / "patients.csv").open("w", newline="", encoding="utf-8") as file:
            writer = csv.DictWriter(file, fieldnames=["patient_id","urgency","wait_minutes"]); writer.writeheader(); writer.writerows(self.engine.metrics.completed)
        return summary
    def console(self) -> str:
        """Format a compact human-readable report without making console output the source of truth."""
        summary = self.engine.metrics.summary(); return f"MedFlow report | completed: {summary['patients_completed']} | avg wait: {summary['average_wait_minutes']} min"
