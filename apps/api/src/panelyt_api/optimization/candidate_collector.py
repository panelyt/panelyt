from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from panelyt_api.db import models
from panelyt_api.optimization.context import CandidateItem, ResolvedBiomarker
from panelyt_api.optimization.synthetic_packages import (
    SyntheticPackage,
    load_diag_synthetic_packages,
)
from panelyt_api.utils.normalization import create_normalized_lookup, normalize_token

PRICE_HISTORY_LOOKBACK_DAYS = 30


class CandidateCollector:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def collect(
        self, biomarkers: Sequence[ResolvedBiomarker], institution_id: int
    ) -> list[CandidateItem]:
        biomarker_ids = [b.id for b in biomarkers]
        if not biomarker_ids:
            return []

        panel_ids, panel_components_by_id = await self._collect_synthetic_panel_aliases(
            biomarkers
        )
        if panel_ids:
            biomarker_ids = list({*biomarker_ids, *panel_ids})

        window_start = datetime.now(UTC).date() - timedelta(
            days=PRICE_HISTORY_LOOKBACK_DAYS
        )
        history = (
            select(
                models.PriceSnapshot.item_id.label("item_id"),
                func.min(models.PriceSnapshot.price_now_grosz).label("hist_min"),
            )
            .where(models.PriceSnapshot.snap_date >= window_start)
            .where(models.PriceSnapshot.institution_id == institution_id)
            .group_by(models.PriceSnapshot.item_id)
            .subquery()
        )

        statement = (
            select(
                models.Item,
                models.InstitutionItem,
                models.ItemBiomarker.biomarker_id,
                models.Biomarker.elab_code,
                models.Biomarker.slug,
                models.Biomarker.name,
                history.c.hist_min,
            )
            .join(
                models.InstitutionItem,
                (models.InstitutionItem.item_id == models.Item.id)
                & (models.InstitutionItem.institution_id == institution_id),
            )
            .join(models.ItemBiomarker, models.Item.id == models.ItemBiomarker.item_id)
            .join(models.Biomarker, models.Biomarker.id == models.ItemBiomarker.biomarker_id)
            .outerjoin(history, history.c.item_id == models.Item.id)
            .where(models.ItemBiomarker.biomarker_id.in_(biomarker_ids))
            .where(models.InstitutionItem.is_available.is_(True))
            .where(models.InstitutionItem.price_now_grosz > 0)
        )

        rows = (await self.session.execute(statement)).all()
        by_id: dict[int, CandidateItem] = {}
        id_to_token = {b.id: b.token for b in biomarkers}
        for (
            item,
            offer,
            biomarker_id,
            _elab_code,
            _slug,
            _name,
            hist_min,
        ) in rows:
            candidate = by_id.get(item.id)
            if candidate is None:
                candidate = CandidateItem(
                    id=item.id,
                    kind=item.kind,
                    name=item.name,
                    slug=item.slug,
                    external_id=item.external_id,
                    price_now=offer.price_now_grosz,
                    price_min30=self._resolve_price_floor(
                        hist_min, offer.price_min30_grosz, offer.price_now_grosz
                    ),
                    sale_price=offer.sale_price_grosz,
                    regular_price=offer.regular_price_grosz,
                )
                by_id[item.id] = candidate
            panel_components = panel_components_by_id.get(biomarker_id)
            if panel_components:
                candidate.coverage.update(panel_components)
            token = id_to_token.get(biomarker_id)
            if token:
                candidate.coverage.add(token)
        await self._apply_synthetic_packages(
            by_id, biomarkers, institution_id, history
        )
        return list(by_id.values())

    async def _collect_synthetic_panel_aliases(
        self, biomarkers: Sequence[ResolvedBiomarker]
    ) -> tuple[set[int], dict[int, set[str]]]:
        synthetic_packages = load_diag_synthetic_packages()
        if not synthetic_packages or not biomarkers:
            return set(), {}

        selected_lookup = create_normalized_lookup(
            {entry.token: entry.token for entry in biomarkers}
        )
        panel_components_by_code: dict[str, set[str]] = {}
        for mapping in synthetic_packages:
            panel_code = mapping.panel_elab_code
            if not panel_code:
                continue
            tokens_all = {
                normalized
                for code in mapping.component_elab_codes
                if (normalized := normalize_token(code)) is not None
            }
            if not tokens_all:
                continue
            if not any(selected_lookup.get(token) for token in tokens_all):
                continue
            panel_components_by_code.setdefault(panel_code, set()).update(
                mapping.component_elab_codes
            )

        if not panel_components_by_code:
            return set(), {}

        statement = select(models.Biomarker.id, models.Biomarker.elab_code).where(
            models.Biomarker.elab_code.in_(list(panel_components_by_code.keys()))
        )
        rows = (await self.session.execute(statement)).all()
        panel_ids: set[int] = set()
        panel_components_by_id: dict[int, set[str]] = {}
        for biomarker_id, elab_code in rows:
            panel_ids.add(biomarker_id)
            components = panel_components_by_code.get(elab_code)
            if components:
                panel_components_by_id[biomarker_id] = set(components)
        return panel_ids, panel_components_by_id

    async def _apply_synthetic_packages(
        self,
        candidates_by_id: dict[int, CandidateItem],
        biomarkers: Sequence[ResolvedBiomarker],
        institution_id: int,
        history_subquery,
    ) -> None:
        synthetic_packages = load_diag_synthetic_packages()
        if not synthetic_packages or not biomarkers:
            return

        selected_lookup = create_normalized_lookup(
            {entry.token: entry.token for entry in biomarkers}
        )

        mapping_by_external: dict[str, SyntheticPackage] = {}
        mapping_by_slug: dict[str, SyntheticPackage] = {}
        mapping_tokens: dict[SyntheticPackage, set[str]] = {}
        for mapping in synthetic_packages:
            tokens_all: set[str] = set()
            for code in mapping.component_elab_codes:
                normalized = normalize_token(code)
                if not normalized:
                    continue
                tokens_all.add(code)
            if not tokens_all:
                continue
            tokens_selected = {
                token
                for token in tokens_all
                if selected_lookup.get(normalize_token(token) or "")
            }
            if not tokens_selected:
                continue
            mapping_tokens[mapping] = tokens_all
            if mapping.external_id:
                mapping_by_external[mapping.external_id] = mapping
            if mapping.slug:
                mapping_by_slug[mapping.slug] = mapping

        if not mapping_tokens:
            return

        external_ids = list(mapping_by_external.keys())
        slugs = list(mapping_by_slug.keys())
        if not external_ids and not slugs:
            return

        filters = []
        if external_ids:
            filters.append(models.Item.external_id.in_(external_ids))
        if slugs:
            filters.append(models.Item.slug.in_(slugs))

        statement = (
            select(
                models.Item,
                models.InstitutionItem,
                history_subquery.c.hist_min,
            )
            .join(
                models.InstitutionItem,
                (models.InstitutionItem.item_id == models.Item.id)
                & (models.InstitutionItem.institution_id == institution_id),
            )
            .outerjoin(history_subquery, history_subquery.c.item_id == models.Item.id)
            .where(or_(*filters))
            .where(models.InstitutionItem.is_available.is_(True))
            .where(models.InstitutionItem.price_now_grosz > 0)
        )

        rows = (await self.session.execute(statement)).all()
        for item, offer, hist_min in rows:
            matched_mapping: SyntheticPackage | None = None
            if item.external_id in mapping_by_external:
                matched_mapping = mapping_by_external[item.external_id]
            elif item.slug in mapping_by_slug:
                matched_mapping = mapping_by_slug[item.slug]
            if matched_mapping is None:
                continue
            tokens = mapping_tokens.get(matched_mapping)
            if not tokens:
                continue
            candidate = candidates_by_id.get(item.id)
            if candidate is None:
                candidate = CandidateItem(
                    id=item.id,
                    kind=item.kind,
                    name=item.name,
                    slug=item.slug,
                    external_id=item.external_id,
                    price_now=offer.price_now_grosz,
                    price_min30=self._resolve_price_floor(
                        hist_min, offer.price_min30_grosz, offer.price_now_grosz
                    ),
                    sale_price=offer.sale_price_grosz,
                    regular_price=offer.regular_price_grosz,
                    is_synthetic_package=True,
                    coverage=set(tokens),
                )
                candidates_by_id[item.id] = candidate
            else:
                candidate.coverage = set(tokens)
                candidate.is_synthetic_package = True

    @staticmethod
    def _resolve_price_floor(
        history_price: int | None, rolling_min: int | None, current_price: int
    ) -> int:
        if history_price is not None:
            return int(history_price)
        if rolling_min is not None:
            return int(rolling_min)
        return int(current_price)
