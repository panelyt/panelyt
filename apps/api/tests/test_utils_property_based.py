from __future__ import annotations

import re
import string

from hypothesis import assume, given, settings, strategies as st

from panelyt_api.ingest.client import _pln_to_grosz
from panelyt_api.utils.normalization import (
    expand_polish_diacritic_queries,
    normalize_search_query,
    normalize_token,
)
from panelyt_api.utils.slugify import slugify_identifier_pl

POLISH_DIACRITICS = "ąćęłńóśżź"
ALLOWED_SLUG_PATTERN = re.compile(r"^[a-z0-9ąęółśżźćń-]*$")
ASCII_TEXT = string.ascii_letters + string.digits + " "


@settings(max_examples=50)
@given(st.text(max_size=50))
def test_slugify_identifier_pl_is_idempotent(value: str) -> None:
    slug = slugify_identifier_pl(value)
    assert slugify_identifier_pl(slug) == slug


@settings(max_examples=50)
@given(st.text(max_size=50))
def test_slugify_identifier_pl_limits_charset(value: str) -> None:
    slug = slugify_identifier_pl(value)
    assert ALLOWED_SLUG_PATTERN.fullmatch(slug) is not None


def test_slugify_identifier_pl_punctuation_only_returns_empty_string() -> None:
    """Edge case: punctuation-only identifiers should normalize to empty."""
    assert slugify_identifier_pl("!!!") == ""


@settings(max_examples=50)
@given(st.text(max_size=50))
def test_normalize_search_query_strips_and_lowercases(value: str) -> None:
    assert normalize_search_query(value) == value.strip().lower()


@settings(max_examples=50)
@given(st.text(max_size=50))
def test_normalize_token_is_idempotent(value: str) -> None:
    normalized = normalize_token(value)
    if normalized is None:
        assert value.strip() == ""
        return
    assert normalized == normalized.strip()
    assert normalized == normalized.lower()
    assert normalize_token(normalized) == normalized


@settings(max_examples=50)
@given(
    prefix=st.text(alphabet=ASCII_TEXT, max_size=10),
    diacritic=st.sampled_from(list(POLISH_DIACRITICS)),
    suffix=st.text(alphabet=ASCII_TEXT, max_size=10),
)
def test_expand_polish_diacritic_queries_preserves_diacritic_inputs(
    prefix: str, diacritic: str, suffix: str
) -> None:
    query = f"{prefix}{diacritic}{suffix}"
    assert expand_polish_diacritic_queries(query) == [query.strip()]


@settings(max_examples=50)
@given(st.text(alphabet=ASCII_TEXT, min_size=1, max_size=30))
def test_expand_polish_diacritic_queries_normalizes_whitespace_and_case(
    query: str,
) -> None:
    assume(query.strip())
    variants = expand_polish_diacritic_queries(query)
    expected = query.strip().lower()
    assert expected in variants
    assert all(variant == variant.strip() for variant in variants)
    assert all(variant == variant.lower() for variant in variants)


@settings(max_examples=50)
@given(st.integers(min_value=0, max_value=1_000_000))
def test_pln_to_grosz_parses_decimal_strings(grosz: int) -> None:
    zloty, cents = divmod(grosz, 100)
    value = f"{zloty},{cents:02d}"
    assert _pln_to_grosz(value) == grosz
    assert _pln_to_grosz(value.replace(",", ".")) == grosz
