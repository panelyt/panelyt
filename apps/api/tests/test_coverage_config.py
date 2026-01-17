from pathlib import Path


def _extract_recipe_body(justfile_text: str, recipe_name: str) -> list[str]:
    lines = justfile_text.splitlines()
    body: list[str] = []
    in_recipe = False

    for line in lines:
        if not in_recipe:
            if line.startswith(f"{recipe_name} ") or line.startswith(f"{recipe_name}:"):
                in_recipe = True
            continue

        if not line.strip():
            break

        if line.startswith(" ") or line.startswith("\t"):
            body.append(line.strip())
            continue

        break

    return body


def _find_repo_root(start: Path) -> Path:
    for candidate in (start, *start.parents):
        if (candidate / "Justfile").exists():
            return candidate
    raise FileNotFoundError("Justfile not found in parent directories")


def test_test_api_includes_coverage_flags():
    repo_root = _find_repo_root(Path(__file__).resolve())
    justfile_path = repo_root / "Justfile"
    justfile_text = justfile_path.read_text(encoding="utf-8")

    recipe_body = _extract_recipe_body(justfile_text, "_test-api")
    assert recipe_body, "Expected _test-api recipe to have a command body."

    command_text = " ".join(recipe_body)
    required_flags = [
        "--cov=panelyt_api",
        "--cov-report=term-missing",
        "--cov-report=xml",
        "--cov-fail-under=70",
    ]

    for flag in required_flags:
        assert flag in command_text


def test_test_api_does_not_use_repo_root_db():
    repo_root = _find_repo_root(Path(__file__).resolve())
    justfile_path = repo_root / "Justfile"
    justfile_text = justfile_path.read_text(encoding="utf-8")

    recipe_body = _extract_recipe_body(justfile_text, "_test-api")
    assert recipe_body, "Expected _test-api recipe to have a command body."

    command_text = " ".join(recipe_body)
    assert "sqlite+aiosqlite:///test.db" not in command_text


def test_mutation_recipe_runs_mutmut():
    repo_root = _find_repo_root(Path(__file__).resolve())
    justfile_path = repo_root / "Justfile"
    justfile_text = justfile_path.read_text(encoding="utf-8")

    recipe_body = _extract_recipe_body(justfile_text, "mutation")
    assert recipe_body, "Expected mutation recipe to have a command body."

    command_text = " ".join(recipe_body)
    assert "mutmut run" in command_text
    assert "--max-children" in command_text


def test_mutation_baseline_recipe_updates_baseline():
    repo_root = _find_repo_root(Path(__file__).resolve())
    justfile_path = repo_root / "Justfile"
    justfile_text = justfile_path.read_text(encoding="utf-8")

    recipe_body = _extract_recipe_body(justfile_text, "mutation-baseline")
    assert recipe_body, "Expected mutation-baseline recipe to have a command body."

    command_text = " ".join(recipe_body)
    assert "mutation_report.py" in command_text
    assert "--update-baseline" in command_text
