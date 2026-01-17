from __future__ import annotations

from pathlib import Path

import pytest

from panelyt_api.core.settings import Settings


@pytest.mark.asyncio
async def test_db_session_does_not_use_repo_root_db(db_session) -> None:
    assert not Path("test.db").exists()


def test_settings_uses_tmp_path_database(test_settings: Settings, tmp_path: Path) -> None:
    assert str(tmp_path) in test_settings.database_url
