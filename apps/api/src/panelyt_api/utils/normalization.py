"""
Shared normalization utilities for consistent text processing across the application.

This module centralizes all text normalization logic to ensure consistency and
reduce code duplication (DRY principle).
"""
import re
from collections.abc import Mapping
from typing import Any


def normalize_token(value: str | None) -> str | None:
    """
    Normalize a token to lowercase and stripped form.

    Used for case-insensitive matching of biomarker codes, lab codes, and identifiers.

    Args:
        value: The string to normalize, or None

    Returns:
        Normalized string (lowercase, stripped) or None if input is None/empty

    Examples:
        >>> normalize_token("  TSH  ")
        "tsh"
        >>> normalize_token(None)
        None
        >>> normalize_token("  ")
        None
    """
    if value is None:
        return None
    normalized = value.strip().lower()
    return normalized or None


def normalize_slug(value: Any) -> str | None:
    """
    Normalize a slug value from external API data.

    Handles None values, strips whitespace, and converts to lowercase.
    Used when ingesting data from external lab APIs.

    Args:
        value: The value to normalize (can be any type, will be converted to string)

    Returns:
        Normalized slug or None if empty

    Examples:
        >>> normalize_slug("  Test-Slug  ")
        "test-slug"
        >>> normalize_slug(None)
        None
        >>> normalize_slug(123)
        "123"
    """
    if value is None:
        return None
    text = str(value).strip().lower()
    return text or None


def normalize_search_query(query: str) -> str:
    """
    Normalize a user search query for consistent matching.

    Strips whitespace and lowercases for case-insensitive search.
    Returns empty string (not None) to simplify search logic.

    Args:
        query: The search query string

    Returns:
        Normalized query string (empty if blank)

    Examples:
        >>> normalize_search_query("  TSH Test  ")
        "tsh test"
        >>> normalize_search_query("  ")
        ""
    """
    return query.strip().lower()


def create_slug_from_text(value: str) -> str:
    """
    Create a URL-safe slug from arbitrary text.

    Converts to lowercase, replaces non-alphanumeric characters with hyphens,
    and removes leading/trailing hyphens.

    Args:
        value: The text to convert to a slug

    Returns:
        URL-safe slug string

    Raises:
        ValueError: If the resulting slug is empty

    Examples:
        >>> create_slug_from_text("My Test Name!")
        "my-test-name"
        >>> create_slug_from_text("TSH & FT4")
        "tsh-ft4"
        >>> create_slug_from_text("!!!") # raises ValueError
    """
    # Replace non-alphanumeric (except hyphens) with hyphens
    normalized = re.sub(r"[^a-z0-9-]+", "-", value.strip().lower())
    # Collapse multiple hyphens into one
    normalized = re.sub(r"-+", "-", normalized).strip("-")

    if not normalized:
        raise ValueError("Slug cannot be blank after normalization")

    return normalized


def normalize_username(username: str, pattern: re.Pattern | None = None) -> str:
    """
    Normalize and validate a username.

    Args:
        username: The username to normalize
        pattern: Optional regex pattern to validate against

    Returns:
        Normalized username (lowercase, stripped)

    Raises:
        ValueError: If username is blank or doesn't match pattern

    Examples:
        >>> normalize_username("  UserName  ")
        "username"
        >>> normalize_username("  ")  # raises ValueError
    """
    normalized = username.strip().lower()

    if not normalized:
        raise ValueError("Username cannot be blank")

    if pattern and not pattern.match(normalized):
        raise ValueError(
            "Username must be 3-64 characters of a-z, 0-9, underscores or hyphens"
        )

    return normalized


def normalize_tokens_set(tokens: list[str] | set[str]) -> set[str]:
    """
    Normalize a collection of tokens to a set of lowercase, stripped values.

    Filters out None, empty, and whitespace-only values.
    Useful for comparing biomarker lists.

    Args:
        tokens: Collection of token strings

    Returns:
        Set of normalized non-empty tokens

    Examples:
        >>> normalize_tokens_set(["TSH", "  FT4  ", "", None, "  "])
        {"tsh", "ft4"}
    """
    normalized = set()
    for token in tokens:
        if not token or not isinstance(token, str):
            continue
        norm = normalize_token(token)
        if norm:
            normalized.add(norm)
    return normalized


def create_normalized_lookup(mapping: Mapping[Any, str]) -> dict[str, Any]:
    """
    Create a reverse lookup dictionary with normalized values as keys.

    Useful for case-insensitive matching against a dictionary of identifiers.
    Filters out None and empty values.

    Args:
        mapping: Dictionary with original keys and string values to normalize

    Returns:
        Reverse dictionary mapping normalized values to original keys

    Examples:
        >>> create_normalized_lookup({1: "TSH", 2: "  FT4  ", 3: ""})
        {"tsh": 1, "ft4": 2}
    """
    return {
        norm: key
        for key, value in mapping.items()
        if (norm := normalize_token(value if isinstance(value, str) else str(value)))
    }


__all__ = [
    "create_normalized_lookup",
    "create_slug_from_text",
    "normalize_search_query",
    "normalize_slug",
    "normalize_token",
    "normalize_tokens_set",
    "normalize_username",
]
