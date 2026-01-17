"""
Tests for normalization utilities.

Ensures consistent behavior across all normalization functions.

These are pure utility function tests that don't require database fixtures.
"""
import re

import pytest

# Import with explicit marking to avoid pytest auto-use fixtures
pytest_plugins = ()

from panelyt_api.utils.normalization import (
    create_normalized_lookup,
    create_slug_from_text,
    expand_polish_diacritic_queries,
    normalize_search_query,
    normalize_slug,
    normalize_token,
    normalize_tokens_set,
    normalize_username,
)


class TestNormalizeToken:
    """Test the normalize_token function."""

    def test_basic_normalization(self):
        assert normalize_token("TSH") == "tsh"
        assert normalize_token("  FT4  ") == "ft4"

    def test_none_input(self):
        assert normalize_token(None) is None

    def test_empty_string(self):
        assert normalize_token("") is None
        assert normalize_token("  ") is None

    def test_already_normalized(self):
        assert normalize_token("tsh") == "tsh"

    def test_mixed_case(self):
        assert normalize_token("TsH-Test") == "tsh-test"


class TestNormalizeSlug:
    """Test the normalize_slug function."""

    def test_string_input(self):
        assert normalize_slug("Test-Slug") == "test-slug"
        assert normalize_slug("  SLUG  ") == "slug"

    def test_none_input(self):
        assert normalize_slug(None) is None

    def test_numeric_input(self):
        assert normalize_slug(123) == "123"
        assert normalize_slug(45.67) == "45.67"

    def test_empty_after_strip(self):
        assert normalize_slug("  ") is None


class TestNormalizeSearchQuery:
    """Test the normalize_search_query function."""

    def test_basic_query(self):
        assert normalize_search_query("TSH Test") == "tsh test"
        assert normalize_search_query("  FT4  ") == "ft4"

    def test_empty_query(self):
        assert normalize_search_query("") == ""
        assert normalize_search_query("  ") == ""

    def test_special_characters(self):
        assert normalize_search_query("TSH & FT4") == "tsh & ft4"


class TestCreateSlugFromText:
    """Test the create_slug_from_text function."""

    def test_basic_slug_creation(self):
        assert create_slug_from_text("My Test Name") == "my-test-name"
        assert create_slug_from_text("TSH & FT4") == "tsh-ft4"

    def test_multiple_spaces_and_special_chars(self):
        assert create_slug_from_text("Test   !!!   Name") == "test-name"

    def test_hyphens_preserved(self):
        assert create_slug_from_text("test-name") == "test-name"

    def test_multiple_hyphens_collapsed(self):
        assert create_slug_from_text("test---name") == "test-name"

    def test_leading_trailing_hyphens_removed(self):
        assert create_slug_from_text("-test-name-") == "test-name"

    def test_empty_input_raises(self):
        with pytest.raises(ValueError, match="^Slug cannot be blank after normalization$"):
            create_slug_from_text("")

    def test_only_special_chars_raises(self):
        with pytest.raises(ValueError, match="^Slug cannot be blank after normalization$"):
            create_slug_from_text("!!!")

    def test_preserves_non_hyphen_characters(self):
        assert create_slug_from_text("X-Test-X") == "x-test-x"


class TestNormalizeUsername:
    """Test the normalize_username function."""

    def test_basic_normalization(self):
        assert normalize_username("UserName") == "username"
        assert normalize_username("  test  ") == "test"

    def test_empty_raises(self):
        with pytest.raises(ValueError, match="^Username cannot be blank$"):
            normalize_username("")

    def test_whitespace_only_raises(self):
        with pytest.raises(ValueError, match="^Username cannot be blank$"):
            normalize_username("  ")

    def test_with_pattern(self):
        pattern = re.compile(r"^[a-z0-9_-]{3,64}$")

        # Valid username
        assert normalize_username("test_user", pattern) == "test_user"
        assert normalize_username("user-123", pattern) == "user-123"

        # Invalid username
        with pytest.raises(
            ValueError,
            match="^Username must be 3-64 characters of a-z, 0-9, underscores or hyphens$",
        ):
            normalize_username("ab", pattern)  # Too short

        with pytest.raises(
            ValueError,
            match="^Username must be 3-64 characters of a-z, 0-9, underscores or hyphens$",
        ):
            normalize_username("user@test", pattern)  # Invalid character


class TestNormalizeTokensSet:
    """Test the normalize_tokens_set function."""

    def test_list_input(self):
        result = normalize_tokens_set(["TSH", "  FT4  ", "tsh"])
        assert result == {"tsh", "ft4"}

    def test_set_input(self):
        result = normalize_tokens_set({"TSH", "FT4"})
        assert result == {"tsh", "ft4"}

    def test_filters_empty(self):
        result = normalize_tokens_set(["TSH", "", "  ", None, "FT4"])
        assert result == {"tsh", "ft4"}

    def test_empty_input(self):
        assert normalize_tokens_set([]) == set()

    def test_filters_none_values(self):
        # Note: None values in the list won't be strings, so they're filtered
        result = normalize_tokens_set(["TSH", None, "FT4"])
        assert result == {"tsh", "ft4"}

    def test_ignores_non_string_values(self):
        result = normalize_tokens_set(["TSH", 123, "FT4"])
        assert result == {"tsh", "ft4"}


class TestCreateNormalizedLookup:
    """Test the create_normalized_lookup function."""

    def test_basic_lookup(self):
        mapping = {1: "TSH", 2: "FT4", 3: "Vitamin D"}
        result = create_normalized_lookup(mapping)
        assert result == {"tsh": 1, "ft4": 2, "vitamin d": 3}

    def test_filters_empty_values(self):
        mapping = {1: "TSH", 2: "", 3: "  ", 4: "FT4"}
        result = create_normalized_lookup(mapping)
        assert result == {"tsh": 1, "ft4": 4}

    def test_last_wins_on_collision(self):
        mapping = {1: "TSH", 2: "tsh", 3: "  TSH  "}
        result = create_normalized_lookup(mapping)
        # Last one wins due to dict comprehension order
        assert "tsh" in result
        assert result["tsh"] in {1, 2, 3}

    def test_numeric_values(self):
        mapping = {"a": "123", "b": "456"}
        result = create_normalized_lookup(mapping)
        assert result == {"123": "a", "456": "b"}

    def test_non_string_values(self):
        mapping = {"a": 123, "b": "456"}
        result = create_normalized_lookup(mapping)
        assert result == {"123": "a", "456": "b"}

    def test_empty_mapping(self):
        assert create_normalized_lookup({}) == {}


class TestExpandPolishDiacriticQueries:
    """Test the expand_polish_diacritic_queries function."""

    def test_generates_full_and_single_variants(self):
        variants = expand_polish_diacritic_queries("Ala")
        assert "ala" in variants
        assert "ąłą" in variants
        assert "ąla" in variants
        assert "ała" in variants
        assert "alą" in variants
        assert "" not in variants
        assert all(isinstance(variant, str) and variant for variant in variants)
        assert len(variants) == len(set(variants))

    def test_generates_z_variants(self):
        variants = expand_polish_diacritic_queries("Zaba")
        assert "zaba" in variants
        assert "żąbą" in variants
        assert "źąbą" in variants
        assert "żaba" in variants
        assert "źaba" in variants

    def test_no_variant_letters_returns_single_entry(self):
        variants = expand_polish_diacritic_queries("Brr")
        assert variants == ["brr"]

    def test_handles_non_variant_prefix(self):
        variants = expand_polish_diacritic_queries("Bala")
        assert "bała" in variants

    def test_skips_non_diacritic_chars(self):
        variants = expand_polish_diacritic_queries("Aba")
        assert "abą" in variants
