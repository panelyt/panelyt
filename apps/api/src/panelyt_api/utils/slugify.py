from __future__ import annotations

import re


def slugify_identifier_pl(value: str | None) -> str:
    if not value:
        return ""
    text = value.lower()
    text = re.sub(r"[^a-z0-9ąęółśżźćń]+", "-", text)
    return text.strip("-")


__all__ = ["slugify_identifier_pl"]
