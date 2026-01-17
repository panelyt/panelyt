from pathlib import Path


def _find_repo_root(start: Path) -> Path:
    for candidate in (start, *start.parents):
        if (candidate / ".github" / "workflows" / "ci.yml").exists():
            return candidate
    raise FileNotFoundError("ci.yml not found in parent directories")


def test_ci_uploads_api_coverage_artifact():
    repo_root = _find_repo_root(Path(__file__).resolve())
    workflow_path = repo_root / ".github" / "workflows" / "ci.yml"
    workflow_text = workflow_path.read_text(encoding="utf-8")

    assert "actions/upload-artifact" in workflow_text
    assert "apps/api/coverage.xml" in workflow_text
