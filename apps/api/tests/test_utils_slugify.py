from __future__ import annotations

from panelyt_api.utils.slugify import slugify_identifier_pl


def test_slugify_identifier_pl_blank_returns_empty_string():
    assert slugify_identifier_pl(None) == ""
    assert slugify_identifier_pl("") == ""
    assert slugify_identifier_pl("   ") == ""


def test_slugify_identifier_pl_preserves_polish_letters():
    assert slugify_identifier_pl("Żółć i śledź") == "żółć-i-śledź"


def test_slugify_identifier_pl_collapses_non_alphanumerics():
    assert slugify_identifier_pl("LDL--cholesterol") == "ldl-cholesterol"
    assert slugify_identifier_pl(" LDL  cholesterol ") == "ldl-cholesterol"
