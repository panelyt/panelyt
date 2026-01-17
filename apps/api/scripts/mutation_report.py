#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

try:
    import mutmut.__main__ as mutmut_main
except ImportError as exc:  # pragma: no cover - executed in CI environments
    raise SystemExit(
        "mutmut is required. Install with the api dev extras: uv sync --extra dev"
    ) from exc


def _load_status_counts(mutants_dir: Path) -> Counter[str]:
    counts: Counter[str] = Counter()
    for meta_path in mutants_dir.rglob("*.meta"):
        data = json.loads(meta_path.read_text())
        exit_codes = data.get("exit_code_by_key", {})
        for exit_code in exit_codes.values():
            counts[mutmut_main.status_by_exit_code[exit_code]] += 1
    return counts


def _mutation_score(counts: Counter[str]) -> float:
    killed = counts.get("killed", 0)
    survived = counts.get("survived", 0)
    total = killed + survived
    return 0.0 if total == 0 else killed / total


def _load_baseline(path: Path) -> float:
    data = json.loads(path.read_text())
    score = data.get("score")
    if score is None:
        raise ValueError(f"Baseline file {path} is missing a score")
    return float(score)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate mutmut mutation score report")
    parser.add_argument("--mutants-dir", default="mutants")
    parser.add_argument("--output", default="mutation-report.json")
    parser.add_argument("--baseline", default="mutation-baseline.json")
    parser.add_argument("--update-baseline", action="store_true")
    args = parser.parse_args()

    mutants_dir = Path(args.mutants_dir)
    if not mutants_dir.exists():
        raise SystemExit(f"Mutants directory not found: {mutants_dir}")

    counts = _load_status_counts(mutants_dir)
    if not counts:
        raise SystemExit("No mutation results found. Did mutmut run?")

    score = _mutation_score(counts)
    report = {
        "score": score,
        "counts": dict(sorted(counts.items())),
    }

    output_path = Path(args.output)
    output_path.write_text(json.dumps(report, indent=2) + "\n")

    baseline_path = Path(args.baseline)
    if args.update_baseline:
        baseline_path.write_text(json.dumps({"score": score}, indent=2) + "\n")
        return 0

    if not baseline_path.exists():
        raise SystemExit(f"Baseline file missing: {baseline_path}")

    baseline_score = _load_baseline(baseline_path)
    if score < baseline_score:
        raise SystemExit(
            f"Mutation score {score:.3f} is below baseline {baseline_score:.3f}"
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
