from __future__ import annotations

import hashlib
from pathlib import Path

import yaml  # type: ignore[import-untyped]
from pydantic import BaseModel, Field, model_validator

_DEFAULT_CONFIG_PATH = Path(__file__).with_name("biomarkers.yaml")


class LabMatchConfig(BaseModel):
    id: str | None = None
    slug: str | None = None

    @property
    def has_key(self) -> bool:
        return bool(self.id or self.slug)


class BiomarkerConfig(BaseModel):
    code: str
    name: str
    slug: str | None = None
    aliases: list[str] = Field(default_factory=list)
    labs: dict[str, list[LabMatchConfig]] = Field(default_factory=dict)
    replaces: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _ensure_lab_entries_have_keys(self) -> BiomarkerConfig:
        for lab_code, matches in self.labs.items():
            for entry in matches:
                if not entry.has_key:
                    raise ValueError(
                        f"Lab mapping for biomarker '{self.code}' and lab '{lab_code}' "
                        "requires at least one of id or slug"
                    )
        return self


class MatchingConfig(BaseModel):
    version: int = 1
    biomarkers: list[BiomarkerConfig] = Field(default_factory=list)


def load_config(path: str | Path | None = None) -> MatchingConfig:
    target = Path(path) if path else _DEFAULT_CONFIG_PATH
    with target.open("r", encoding="utf-8") as fh:
        payload = yaml.safe_load(fh) or {}
    return MatchingConfig.model_validate(payload)

def config_hash(path: str | Path | None = None) -> str:
    target = Path(path) if path else _DEFAULT_CONFIG_PATH
    return hashlib.sha256(target.read_bytes()).hexdigest()


__all__ = [
    "BiomarkerConfig",
    "LabMatchConfig",
    "MatchingConfig",
    "config_hash",
    "load_config",
]
