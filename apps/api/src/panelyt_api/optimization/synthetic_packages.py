from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class SyntheticPackage:
    external_id: str | None
    slug: str | None
    panel_elab_code: str | None
    component_elab_codes: tuple[str, ...]


def _default_config_path() -> Path:
    return Path(__file__).resolve().parents[3] / "data" / "diag_synthetic_packages.json"


def _normalize_component(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _parse_entry(entry: Any) -> SyntheticPackage | None:
    if not isinstance(entry, dict):
        return None
    external_id = _normalize_component(entry.get("source_external_id"))
    slug = _normalize_component(entry.get("source_slug"))
    panel_elab_code = _normalize_component(entry.get("panel_elab_code"))
    raw_components = entry.get("component_elab_codes")
    if not isinstance(raw_components, list):
        return None
    components = tuple(
        value
        for raw in raw_components
        if (value := _normalize_component(raw)) is not None
    )
    if not components or (external_id is None and slug is None):
        return None
    return SyntheticPackage(
        external_id=external_id,
        slug=slug,
        panel_elab_code=panel_elab_code,
        component_elab_codes=components,
    )


@lru_cache(maxsize=1)
def load_diag_synthetic_packages() -> list[SyntheticPackage]:
    path = _default_config_path()
    if not path.exists():
        return []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Failed to load synthetic packages: %s", exc)
        return []
    items = payload.get("items") if isinstance(payload, dict) else None
    if not isinstance(items, list):
        return []
    parsed: list[SyntheticPackage] = []
    for entry in items:
        package = _parse_entry(entry)
        if package is not None:
            parsed.append(package)
    return parsed


__all__ = ["SyntheticPackage", "load_diag_synthetic_packages"]
