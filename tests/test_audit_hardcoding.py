"""Automated test enforcing Master Directive zero-hardcoding compliance."""
import subprocess
import sys
from pathlib import Path

def test_zero_hardcoding_audit():
    root = Path(__file__).resolve().parent.parent
    audit_script = root / "scripts" / "audit_hardcoding.py"
    result = subprocess.run([sys.executable, str(audit_script)], capture_output=True, text=True)
    assert result.returncode == 0, f"Audit failed with output:\n{result.stdout}\n{result.stderr}"
