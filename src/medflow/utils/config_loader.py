"""Configuration loading with a deliberately small, inspectable surface."""
from __future__ import annotations
from pathlib import Path
import yaml
def load_config(path: str | Path = "config/config.yaml") -> dict:
    """Load simulation controls from YAML so clinical assumptions stay outside code."""
    with Path(path).open(encoding="utf-8") as file: return yaml.safe_load(file)
