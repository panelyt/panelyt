#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import difflib
import json
import re
import sys
import unicodedata
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from panelyt_api.ingest.client import AlabClient, DiagClient
from panelyt_api.ingest.types import LabIngestionResult, RawLabBiomarker, RawLabItem

DEFAULT_OUTPUT_PATH = (
    Path(__file__)
    .resolve()
    .parents[1]
    / "src"
    / "panelyt_api"
    / "matching"
    / "biomarkers.yaml"
)


class _IndentSafeDumper(yaml.SafeDumper):
    def increase_indent(self, flow: bool = False, indentless: bool = False):
        return super().increase_indent(flow=flow, indentless=False)


@dataclass(slots=True)
class BiomarkerRecord:
    lab: str
    id: str
    name: str
    slug: str | None
    price_grosz: int | None
    waiting_days: float | None
    source_item: RawLabItem | None = None
    source_biomarker: RawLabBiomarker | None = None
    normalized_name: str = field(init=False)
    core_normalized_name: str = field(init=False)
    normalized_slug: str = field(init=False)
    tokens: set[str] = field(init=False)

    def __post_init__(self) -> None:
        self.normalized_name = normalize_name(self.name)
        self.core_normalized_name = normalize_core_name(self.name)
        self.normalized_slug = normalize_slug(self.slug)
        self.tokens = _extract_tokens(
            " ".join({self.normalized_name, self.core_normalized_name}),
            self.normalized_slug,
        )


@dataclass(slots=True)
class MatchResult:
    diag: BiomarkerRecord | None
    alab: BiomarkerRecord | None
    score: float
    strategy: str
    details: dict[str, float]


def normalize_name(value: str | None) -> str:
    if not value:
        return ""
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", " ", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def normalize_slug(value: str | None) -> str:
    if not value:
        return ""
    value = value.strip().lower().replace("_", "-")
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = re.sub(r"[^a-z0-9-]+", "-", value)
    value = re.sub(r"-+", "-", value)
    return value.strip("-")


def normalize_core_name(value: str | None) -> str:
    if not value:
        return ""
    stripped = re.sub(r"\([^)]*\)", " ", value)
    stripped = re.sub(r"\[[^]]*\]", " ", stripped)
    stripped = stripped.split(" - ")[0]
    stripped = stripped.split(":")[0]
    return normalize_name(stripped)


def slugify(value: str, fallback: str) -> str:
    slug = normalize_slug(value)
    return slug or fallback


def _extract_tokens(name: str, slug: str) -> set[str]:
    tokens: set[str] = set()
    for token in re.split(r"[\s-]", name):
        if len(token) >= 2:
            tokens.add(token)
    for token in slug.split("-"):
        if len(token) >= 2:
            tokens.add(token)
    return tokens


def parse_waiting_time(value: str | None) -> float | None:
    if not value:
        return None
    value = value.strip().lower()
    if not value:
        return None
    numbers = [n.replace(",", ".") for n in re.findall(r"\d+(?:[.,]\d+)?", value)]
    if not numbers:
        return None
    values = [float(n) for n in numbers]
    if "godz" in value:
        values = [v / 24 for v in values]
    if len(values) == 1:
        return values[0]
    return sum(values) / len(values)


def collect_diag_records(result: LabIngestionResult) -> dict[str, BiomarkerRecord]:
    waiting_by_id = _index_diag_waiting_times(result)
    records: dict[str, BiomarkerRecord] = {}
    for item in result.items:
        if item.kind != "single":
            continue
        price = item.price_now_grosz or item.price_min30_grosz or None
        for biomarker in item.biomarkers:
            biom_id = str(biomarker.external_id)
            if not biom_id:
                continue
            slug = biomarker.slug or item.slug
            record = BiomarkerRecord(
                lab="diag",
                id=biom_id,
                name=biomarker.name.strip() if biomarker.name else item.name,
                slug=slug,
                price_grosz=price,
                waiting_days=waiting_by_id.get(biom_id),
                source_item=item,
                source_biomarker=biomarker,
            )
            existing = records.get(biom_id)
            if existing is None:
                records[biom_id] = record
                continue
            if record.price_grosz and not existing.price_grosz:
                records[biom_id] = record
            elif record.waiting_days and not existing.waiting_days:
                records[biom_id] = record
    return records


def _index_diag_waiting_times(result: LabIngestionResult) -> dict[str, float]:
    waiting: dict[str, float] = {}
    raw_sections = (
        result.raw_payload.get("singles") if isinstance(result.raw_payload, dict) else None
    )
    if not isinstance(raw_sections, dict):
        return waiting
    for payload in raw_sections.values():
        data = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(data, list):
            continue
        for entry in data:
            if not isinstance(entry, dict):
                continue
            entry_id = entry.get("id")
            if entry_id in (None, ""):
                continue
            prices = entry.get("prices") or {}
            waiting_time = prices.get("waitingTime") or entry.get("globalWaitingTime")
            parsed = parse_waiting_time(waiting_time)
            if parsed is not None:
                waiting[str(entry_id)] = parsed
    return waiting


def collect_alab_records(result: LabIngestionResult) -> dict[str, BiomarkerRecord]:
    waiting_by_id = _index_alab_waiting_times(result)
    records: dict[str, BiomarkerRecord] = {}
    for item in result.items:
        if item.kind != "single":
            continue
        price = item.price_now_grosz or item.price_min30_grosz or None
        for biomarker in item.biomarkers:
            biom_id = str(biomarker.external_id)
            if not biom_id:
                continue
            slug = biomarker.slug or item.slug
            record = BiomarkerRecord(
                lab="alab",
                id=biom_id,
                name=biomarker.name.strip() if biomarker.name else item.name,
                slug=slug,
                price_grosz=price,
                waiting_days=waiting_by_id.get(biom_id),
                source_item=item,
                source_biomarker=biomarker,
            )
            existing = records.get(biom_id)
            if existing is None:
                records[biom_id] = record
                continue
            if record.price_grosz and not existing.price_grosz:
                records[biom_id] = record
            elif record.waiting_days and not existing.waiting_days:
                records[biom_id] = record
    return records


def _index_alab_waiting_times(result: LabIngestionResult) -> dict[str, float]:
    waiting: dict[str, float] = {}
    raw_sections = (
        result.raw_payload.get("examinations") if isinstance(result.raw_payload, dict) else None
    )
    if not isinstance(raw_sections, dict):
        return waiting
    for payload in raw_sections.values():
        data = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(data, list):
            continue
        for entry in data:
            if not isinstance(entry, dict):
                continue
            entry_id = entry.get("id")
            if entry_id in (None, ""):
                continue
            result_days = entry.get("result_in_days")
            if result_days in (None, ""):
                continue
            try:
                waiting[str(entry_id)] = float(result_days)
            except (TypeError, ValueError):
                parsed = parse_waiting_time(str(result_days))
                if parsed is not None:
                    waiting[str(entry_id)] = parsed
    return waiting


def match_records(
    diag_records: dict[str, BiomarkerRecord],
    alab_records: dict[str, BiomarkerRecord],
) -> tuple[list[MatchResult], list[BiomarkerRecord], list[BiomarkerRecord]]:
    unmatched_diag = set(diag_records.keys())
    unmatched_alab = set(alab_records.keys())
    matches: list[MatchResult] = []

    name_index: dict[str, list[str]] = defaultdict(list)
    slug_index: dict[str, list[str]] = defaultdict(list)
    token_index: dict[str, set[str]] = defaultdict(set)

    for alab in alab_records.values():
        if alab.normalized_name:
            name_index[alab.normalized_name].append(alab.id)
        if alab.normalized_slug:
            slug_index[alab.normalized_slug].append(alab.id)
        for token in alab.tokens:
            token_index[token].add(alab.id)

    # Step 1: exact name match
    for diag_id in list(unmatched_diag):
        diag = diag_records[diag_id]
        candidates = [
            alab_id
            for alab_id in name_index.get(diag.normalized_name, [])
            if alab_id in unmatched_alab
        ]
        if len(candidates) == 1:
            alab = alab_records[candidates[0]]
            matches.append(
                MatchResult(diag=diag, alab=alab, score=1.0, strategy="exact-name", details={})
            )
            unmatched_diag.remove(diag_id)
            unmatched_alab.remove(alab.id)

    # Step 2: exact slug match
    for diag_id in list(unmatched_diag):
        diag = diag_records[diag_id]
        if not diag.normalized_slug:
            continue
        candidates = [
            alab_id
            for alab_id in slug_index.get(diag.normalized_slug, [])
            if alab_id in unmatched_alab
        ]
        if len(candidates) == 1:
            alab = alab_records[candidates[0]]
            matches.append(
                MatchResult(diag=diag, alab=alab, score=0.98, strategy="exact-slug", details={})
            )
            unmatched_diag.remove(diag_id)
            unmatched_alab.remove(alab.id)

    # Step 3: fuzzy matching with heuristics
    for diag_id in list(unmatched_diag):
        diag = diag_records[diag_id]
        candidate_ids: set[str] = set()
        for token in diag.tokens:
            candidate_ids.update(token_index.get(token, set()))
        if not candidate_ids:
            # fall back to full set if name is very short
            candidate_ids = set(unmatched_alab)
        else:
            candidate_ids &= unmatched_alab
        if not candidate_ids:
            continue
        best_match: tuple[str, float, dict[str, float]] | None = None
        for alab_id in candidate_ids:
            alab = alab_records[alab_id]
            score, details = compute_match_score(diag, alab)
            if best_match is None or score > best_match[1]:
                best_match = (alab_id, score, details)
        if not best_match:
            continue
        alab_id, score, details = best_match
        alab = alab_records[alab_id]
        if should_accept_match(score, details):
            matches.append(
                MatchResult(
                    diag=diag,
                    alab=alab,
                    score=score,
                    strategy="heuristic",
                    details=details,
                )
            )
            unmatched_diag.remove(diag_id)
            unmatched_alab.remove(alab_id)

    remaining_diag = [diag_records[diag_id] for diag_id in sorted(unmatched_diag)]
    remaining_alab = [alab_records[alab_id] for alab_id in sorted(unmatched_alab)]
    return matches, remaining_diag, remaining_alab


def compute_match_score(
    diag: BiomarkerRecord, alab: BiomarkerRecord
) -> tuple[float, dict[str, float]]:
    raw_name_similarity = similarity(diag.normalized_name, alab.normalized_name)
    slug_similarity = similarity(diag.normalized_slug, alab.normalized_slug)
    core_name_similarity = similarity(diag.core_normalized_name, alab.core_normalized_name)
    name_similarity = max(raw_name_similarity, core_name_similarity)
    token_overlap = float(len(diag.tokens & alab.tokens))

    combined = 0.7 * name_similarity + 0.3 * slug_similarity

    waiting_bonus = 0.0
    if diag.waiting_days is not None and alab.waiting_days is not None:
        diff = abs(diag.waiting_days - alab.waiting_days)
        if diff < 0.1:
            waiting_bonus = 0.05
        elif diff <= 1:
            waiting_bonus = 0.03
        elif diff <= 2:
            waiting_bonus = 0.01

    price_bonus = 0.0
    if diag.price_grosz and alab.price_grosz:
        avg_price = (diag.price_grosz + alab.price_grosz) / 2
        if avg_price > 0:
            diff = abs(diag.price_grosz - alab.price_grosz)
            ratio = diff / avg_price
            if ratio <= 0.05:
                price_bonus = 0.05
            elif ratio <= 0.1:
                price_bonus = 0.03
            elif ratio <= 0.2:
                price_bonus = 0.01

    score = combined + waiting_bonus + price_bonus
    return score, {
        "name_similarity": name_similarity,
        "raw_name_similarity": raw_name_similarity,
        "core_name_similarity": core_name_similarity,
        "slug_similarity": slug_similarity,
        "token_overlap": token_overlap,
        "waiting_bonus": waiting_bonus,
        "price_bonus": price_bonus,
        "score": score,
    }


def similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a, b).ratio()


def should_accept_match(score: float, details: dict[str, float]) -> bool:
    name_similarity = details.get("name_similarity", 0.0)
    slug_similarity = details.get("slug_similarity", 0.0)
    token_overlap = details.get("token_overlap", 0.0)
    core_similarity = details.get("core_name_similarity", 0.0)

    if name_similarity >= 0.95 and token_overlap >= 1:
        return True
    if slug_similarity >= 0.97:
        return True
    if core_similarity >= 0.92 and slug_similarity >= 0.8:
        return True
    if core_similarity >= 0.9 and token_overlap >= 1:
        return True
    if score >= 0.9 and name_similarity >= 0.75 and token_overlap >= 1:
        return True
    if score >= 0.85 and token_overlap >= 2 and name_similarity >= 0.7:
        return True
    return False


def build_yaml_payload(
    matches: Sequence[MatchResult],
    unmatched_diag: Sequence[BiomarkerRecord],
    unmatched_alab: Sequence[BiomarkerRecord],
) -> dict[str, object]:
    entries: list[dict[str, object]] = []
    used_codes: set[str] = set()

    def register_entry(
        code: str,
        name: str,
        slug: str,
        aliases: list[str],
        labs: dict[str, list[dict[str, str]]],
    ) -> None:
        base_code = code or slug
        candidate = base_code or slugify(name, fallback="biomarker")
        if not candidate:
            candidate = "biomarker"
        final_code = candidate
        counter = 2
        while final_code in used_codes:
            final_code = f"{candidate}-{counter}"
            counter += 1
        used_codes.add(final_code)
        entry: dict[str, object] = {
            "code": final_code,
            "name": name,
            "slug": slug or final_code,
            "labs": labs,
        }
        if aliases:
            entry["aliases"] = aliases
        entries.append(entry)

    for match in matches:
        diag = match.diag
        alab = match.alab
        if not diag and not alab:
            continue
        base_name = diag.name if diag else (alab.name if alab else "Biomarker")
        slug_candidates = [
            diag.slug if diag else None,
            alab.slug if alab else None,
            slugify(base_name, fallback=""),
        ]
        slug_value = next(
            (s for s in slug_candidates if s),
            slugify(base_name, fallback="biomarker"),
        )
        name_aliases = []
        seen_names = {base_name}
        if diag and diag.name not in seen_names:
            name_aliases.append(diag.name)
            seen_names.add(diag.name)
        if alab and alab.name not in seen_names:
            name_aliases.append(alab.name)
            seen_names.add(alab.name)
        labs: dict[str, list[dict[str, str]]] = {}
        if diag:
            labs["diag"] = [_build_lab_entry(diag)]
        if alab:
            labs["alab"] = [_build_lab_entry(alab)]
        register_entry(slug_value, base_name, slug_value, name_aliases, labs)

    for record in unmatched_diag:
        slug_value = record.slug or slugify(record.name, fallback=f"diag-{record.id}")
        labs = {"diag": [_build_lab_entry(record)]}
        register_entry(slug_value, record.name, slug_value, [], labs)

    for record in unmatched_alab:
        slug_value = record.slug or slugify(record.name, fallback=f"alab-{record.id}")
        labs = {"alab": [_build_lab_entry(record)]}
        register_entry(slug_value, record.name, slug_value, [], labs)

    entries.sort(key=lambda entry: entry["code"])
    return {"version": 1, "biomarkers": entries}


def _build_lab_entry(record: BiomarkerRecord) -> dict[str, str]:
    entry = {"id": str(record.id)}
    if record.slug:
        entry["slug"] = record.slug
    return entry


def write_yaml(payload: dict[str, object], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8") as handle:
        yaml.dump(
            payload,
            handle,
            Dumper=_IndentSafeDumper,
            sort_keys=False,
            allow_unicode=True,
            default_flow_style=False,
            width=160,
        )


def format_summary(
    matches: Sequence[MatchResult],
    unmatched_diag: Sequence[BiomarkerRecord],
    unmatched_alab: Sequence[BiomarkerRecord],
) -> str:
    summary = {
        "matched": len(matches),
        "unmatched_diag": len(unmatched_diag),
        "unmatched_alab": len(unmatched_alab),
    }
    lines = ["Biomarker matching summary:"]
    lines.append(json.dumps(summary, ensure_ascii=False, indent=2))
    return "\n".join(lines)


async def compile_biomarkers(output_path: Path) -> None:
    diag_client = DiagClient()
    alab_client = AlabClient()
    try:
        diag_result, alab_result = await asyncio.gather(
            diag_client.fetch_all(),
            alab_client.fetch_all(),
        )
    finally:
        await asyncio.gather(diag_client.close(), alab_client.close())

    diag_records = collect_diag_records(diag_result)
    alab_records = collect_alab_records(alab_result)

    matches, unmatched_diag, unmatched_alab = match_records(diag_records, alab_records)

    payload = build_yaml_payload(matches, unmatched_diag, unmatched_alab)
    write_yaml(payload, output_path)

    print(format_summary(matches, unmatched_diag, unmatched_alab))


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Compile biomarkers matching YAML")
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_PATH,
        help="Path to write biomarkers YAML (default: matching/biomarkers.yaml)",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> None:
    args = parse_args(argv or sys.argv[1:])
    try:
        asyncio.run(compile_biomarkers(args.output))
    except KeyboardInterrupt:
        print("Interrupted", file=sys.stderr)
        raise SystemExit(2) from None


if __name__ == "__main__":
    main()
