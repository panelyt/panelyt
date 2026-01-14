"""Text normalization helpers used across the API."""
import re
from collections.abc import Mapping
from typing import Any


def normalize_token(value: str | None) -> str | None:
    """Normalize a token to lowercase/stripped form or None if blank."""
    if value is None:
        return None
    normalized = value.strip().lower()
    return normalized or None


def normalize_slug(value: Any) -> str | None:
    """Normalize a slug value from external data to lowercase or None."""
    if value is None:
        return None
    text = str(value).strip().lower()
    return text or None


def normalize_search_query(query: str) -> str:
    """Normalize a search query for case-insensitive matching."""
    return query.strip().lower()


def create_slug_from_text(value: str) -> str:
    """Create a URL-safe slug from text or raise ValueError if empty."""
    # Replace non-alphanumeric (except hyphens) with hyphens
    normalized = re.sub(r"[^a-z0-9-]+", "-", value.strip().lower())
    # Collapse multiple hyphens into one
    normalized = re.sub(r"-+", "-", normalized).strip("-")

    if not normalized:
        raise ValueError("Slug cannot be blank after normalization")

    return normalized


_POLISH_DIACRITIC_VARIANTS: dict[str, tuple[str, ...]] = {
    "a": ("ą",),
    "c": ("ć",),
    "e": ("ę",),
    "l": ("ł",),
    "n": ("ń",),
    "o": ("ó",),
    "s": ("ś",),
    "z": ("ż", "ź"),
}
_POLISH_DIACRITICS = {char for variants in _POLISH_DIACRITIC_VARIANTS.values() for char in variants}


def expand_polish_diacritic_queries(query: str) -> list[str]:
    """Generate diacritic-aware search query variants for Polish input."""
    base = query.strip()
    if not base:
        return [base]
    lowered = base.lower()
    if any(char in _POLISH_DIACRITICS for char in lowered):
        return [base]

    variants: list[str] = []
    seen: set[str] = set()

    def add(candidate: str) -> None:
        if candidate and candidate not in seen:
            seen.add(candidate)
            variants.append(candidate)

    def apply_full_variant(z_replacement: str | None) -> str:
        chars: list[str] = []
        for char in lowered:
            if char in _POLISH_DIACRITIC_VARIANTS:
                replacements = _POLISH_DIACRITIC_VARIANTS[char]
                if char == "z" and z_replacement is not None:
                    chars.append(z_replacement)
                else:
                    chars.append(replacements[0])
            else:
                chars.append(char)
        return "".join(chars)

    add(lowered)

    primary_full = apply_full_variant(None)
    add(primary_full)

    if "z" in lowered:
        secondary_full = apply_full_variant("ź")
        add(secondary_full)

    for index, char in enumerate(lowered):
        replacements = _POLISH_DIACRITIC_VARIANTS.get(char)
        if not replacements:
            continue
        for replacement in replacements:
            add(f"{lowered[:index]}{replacement}{lowered[index + 1:]}")

    return variants


def normalize_username(username: str, pattern: re.Pattern | None = None) -> str:
    """Normalize and validate a username."""
    normalized = username.strip().lower()

    if not normalized:
        raise ValueError("Username cannot be blank")

    if pattern and not pattern.match(normalized):
        raise ValueError(
            "Username must be 3-64 characters of a-z, 0-9, underscores or hyphens"
        )

    return normalized


def normalize_tokens_set(tokens: list[str] | set[str]) -> set[str]:
    """Normalize tokens into a set of lowercase, non-empty values."""
    normalized = set()
    for token in tokens:
        if not token or not isinstance(token, str):
            continue
        norm = normalize_token(token)
        if norm:
            normalized.add(norm)
    return normalized


def create_normalized_lookup(mapping: Mapping[Any, str]) -> dict[str, Any]:
    """Create a reverse lookup using normalized values as keys."""
    return {
        norm: key
        for key, value in mapping.items()
        if (norm := normalize_token(value if isinstance(value, str) else str(value)))
    }


__all__ = [
    "create_normalized_lookup",
    "create_slug_from_text",
    "expand_polish_diacritic_queries",
    "normalize_search_query",
    "normalize_slug",
    "normalize_token",
    "normalize_tokens_set",
    "normalize_username",
]
