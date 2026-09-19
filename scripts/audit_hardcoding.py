#!/usr/bin/env python3
"""Audit codebase for banned hardcoding patterns per Master Directive."""
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

TARGET_DIRS = [
    ROOT / "src",
    ROOT / "dashboard" / "src",
]

# Regex patterns for banned hardcoded domain elements and mock tags
BANNED_COMMENT_PATTERNS = [
    re.compile(r"(?:#|//)\s*(?:TODO:\s*replace with real data|mock|placeholder|hardcoded for now)", re.IGNORECASE),
]

BANNED_LITERAL_PATTERNS = [
    # Explicit domain resource instance literals hardcoded in code
    re.compile(r'["\'](?:ER|ICU|SURGERY|GENERAL|TRAUMA)-(?:DOCTOR|NURSE|BED|ICU_BED|AMBULANCE)-\d+["\']', re.IGNORECASE),
    re.compile(r'["\']Bed-\d+["\']', re.IGNORECASE),
    # Fixed mock arrays in frontend components
    re.compile(r'(?:const|let|var)\s+(?:sampleData|mockData|dummyData|mockPatients|samplePatients)\s*=\s*\[', re.IGNORECASE),
]

def audit():
    violations = []
    scanned_count = 0

    for target_dir in TARGET_DIRS:
        if not target_dir.exists():
            continue
        for root, _, files in os.walk(target_dir):
            for file in files:
                if not file.endswith((".py", ".ts", ".tsx", ".js")):
                    continue
                file_path = Path(root) / file
                scanned_count += 1
                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        lines = f.readlines()
                except Exception as e:
                    print(f"Could not read {file_path}: {e}", file=sys.stderr)
                    continue

                for line_idx, line in enumerate(lines, start=1):
                    # Check banned comments
                    for pat in BANNED_COMMENT_PATTERNS:
                        if pat.search(line):
                            violations.append((file_path, line_idx, line.strip(), "Banned placeholder/mock comment"))
                    
                    # Check banned literals
                    for pat in BANNED_LITERAL_PATTERNS:
                        if pat.search(line):
                            violations.append((file_path, line_idx, line.strip(), "Banned hardcoded domain entity literal or mock array"))

    print("=" * 60)
    print("  MedFlow Hardcoding & Dynamism Audit")
    print("=" * 60)
    print(f"Scanned {scanned_count} source files across src/ and dashboard/src/.")
    print()

    if violations:
        print(f"[FAIL] Found {len(violations)} violation(s):\n")
        for fpath, lno, snippet, reason in violations:
            rel_path = fpath.relative_to(ROOT)
            print(f"  {rel_path}:{lno}: [{reason}]")
            print(f"    >>> {snippet}")
        print("\nPlease eliminate all hardcoded domain literals before proceeding.")
        sys.exit(1)
    else:
        print("[PASS] Zero hardcoded domain literals or mock arrays detected.")
        sys.exit(0)

if __name__ == "__main__":
    audit()
