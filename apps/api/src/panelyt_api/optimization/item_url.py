from __future__ import annotations

from panelyt_api.core.diag import (
    DIAG_PACKAGE_ITEM_URL_TEMPLATE,
    DIAG_SINGLE_ITEM_URL_TEMPLATE,
)
from panelyt_api.optimization.context import CandidateItem


def item_url(item: CandidateItem) -> str:
    template = (
        DIAG_PACKAGE_ITEM_URL_TEMPLATE
        if item.kind == "package"
        else DIAG_SINGLE_ITEM_URL_TEMPLATE
    )
    try:
        return template.format(slug=item.slug, external_id=item.external_id)
    except Exception:  # pragma: no cover - fallback for malformed templates
        return template
