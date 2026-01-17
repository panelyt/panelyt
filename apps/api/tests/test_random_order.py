from __future__ import annotations

from pathlib import Path
import tomllib


def test_pytest_randomly_enabled() -> None:
    pyproject_path = Path(__file__).resolve().parents[1] / "pyproject.toml"
    data = tomllib.loads(pyproject_path.read_text(encoding="utf-8"))

    dev_deps = data.get("project", {}).get("optional-dependencies", {}).get("dev", [])
    assert any(dep.startswith("pytest-randomly") for dep in dev_deps)

    addopts = data.get("tool", {}).get("pytest", {}).get("ini_options", {}).get("addopts", "")
    assert "--randomly" in addopts
