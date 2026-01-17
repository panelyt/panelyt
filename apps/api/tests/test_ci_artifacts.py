from pathlib import Path


def test_ci_uploads_api_coverage_artifact():
    repo_root = Path(__file__).resolve().parents[3]
    workflow_path = repo_root / ".github" / "workflows" / "ci.yml"
    workflow_text = workflow_path.read_text(encoding="utf-8")

    assert "actions/upload-artifact" in workflow_text
    assert "apps/api/coverage.xml" in workflow_text
