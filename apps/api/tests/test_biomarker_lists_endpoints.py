from __future__ import annotations

from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from panelyt_api.db.models import (
    Biomarker,
    BiomarkerListTemplate,
    BiomarkerListTemplateEntry,
)


@pytest.mark.asyncio
async def test_template_endpoints(async_client: AsyncClient, db_session: AsyncSession) -> None:
    biomarker = Biomarker(name="Alanine", elab_code="ALT", slug="alt")
    db_session.add(biomarker)
    await db_session.flush()

    template_active = BiomarkerListTemplate(
        slug="liver-check",
        name_en="Liver Check",
        name_pl="Kontrola watroby",
        description_en="Liver health markers",
        description_pl="Markery zdrowia watroby",
        is_active=True,
    )
    template_inactive = BiomarkerListTemplate(
        slug="archived",
        name_en="Archived",
        name_pl="Zarchiwizowane",
        description_en="Should not appear",
        description_pl="Nie powinno sie pojawic",
        is_active=False,
    )
    db_session.add_all([template_active, template_inactive])
    await db_session.flush()

    db_session.add(
        BiomarkerListTemplateEntry(
            template_id=template_active.id,
            biomarker_id=biomarker.id,
            code="ALT",
            display_name="ALT",
            sort_order=0,
        )
    )
    await db_session.commit()

    response = await async_client.get("/biomarker-lists/templates")
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["templates"]) == 1
    assert payload["templates"][0]["slug"] == "liver-check"
    assert payload["templates"][0]["biomarkers"][0]["code"] == "ALT"

    detail = await async_client.get("/biomarker-lists/templates/liver-check")
    assert detail.status_code == 200
    detail_payload = detail.json()
    assert detail_payload["name_en"] == "Liver Check"
    assert detail_payload["name_pl"] == "Kontrola watroby"
    assert [entry["code"] for entry in detail_payload["biomarkers"]] == ["ALT"]

    missing = await async_client.get("/biomarker-lists/templates/missing")
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_shared_list_endpoint(async_client: AsyncClient, db_session: AsyncSession) -> None:
    biomarker = Biomarker(name="C-reactive protein", elab_code="CRP", slug="crp")
    db_session.add(biomarker)
    await db_session.flush()

    # Minimal saved list seeded directly
    from panelyt_api.db.models import SavedList, SavedListEntry, UserAccount

    user = UserAccount(id="user-123")
    saved_list = SavedList(
        id="list-123",
        user_id=user.id,
        name="Inflammation",
        share_token="shared-token",
        shared_at=datetime.now(UTC),
    )
    entry = SavedListEntry(
        list_id=saved_list.id,
        biomarker_id=biomarker.id,
        code="CRP",
        display_name="C-Reactive Protein",
        sort_order=0,
    )
    db_session.add_all([user, saved_list, entry])
    await db_session.commit()

    response = await async_client.get("/biomarker-lists/shared/shared-token")
    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == "list-123"
    assert payload["share_token"] == "shared-token"
    assert [item["code"] for item in payload["biomarkers"]] == ["CRP"]

    not_found = await async_client.get("/biomarker-lists/shared/unknown")
    assert not_found.status_code == 404


@pytest.mark.asyncio
async def test_admin_template_crud(async_client: AsyncClient, db_session: AsyncSession) -> None:
    biomarker = Biomarker(name="Fasting Glucose", elab_code="GLU", slug="glu")
    db_session.add(biomarker)
    await db_session.commit()

    session_response = await async_client.post("/users/session")
    assert session_response.status_code == 200

    register_response = await async_client.post(
        "/users/register",
        json={"username": "admin", "password": "AdminPass123"},
    )
    assert register_response.status_code == 201
    session_after_register = await async_client.post("/users/session")
    assert session_after_register.status_code == 200
    assert session_after_register.json()["is_admin"] is True

    create_payload = {
        "slug": "metabolic-basics",
        "name_en": "Metabolic Basics",
        "name_pl": "Podstawy metabolizmu",
        "description_en": "Core metabolic markers",
        "description_pl": "Podstawowe markery metaboliczne",
        "is_active": True,
        "biomarkers": [
            {"code": "GLU", "display_name": "Glucose", "notes": "Fasting"},
        ],
    }
    create_response = await async_client.post(
        "/biomarker-lists/admin/templates",
        json=create_payload,
    )
    assert create_response.status_code == 201
    created = create_response.json()
    assert created["slug"] == "metabolic-basics"
    assert created["is_active"] is True
    assert [entry["code"] for entry in created["biomarkers"]] == ["GLU"]

    admin_list = await async_client.get("/biomarker-lists/admin/templates")
    assert admin_list.status_code == 200
    listed = admin_list.json()["templates"]
    assert any(template["slug"] == "metabolic-basics" for template in listed)

    update_payload = {
        "slug": "metabolic-insight",
        "name_en": "Metabolic Insight",
        "name_pl": "Wglad metaboliczny",
        "description_en": "Updated panel",
        "description_pl": "Zaktualizowany panel",
        "is_active": False,
        "biomarkers": [
            {"code": "GLU", "display_name": "Glucose", "notes": None},
        ],
    }
    update_response = await async_client.put(
        "/biomarker-lists/admin/templates/metabolic-basics",
        json=update_payload,
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["slug"] == "metabolic-insight"
    assert updated["is_active"] is False
    assert updated["name_en"] == "Metabolic Insight"
    assert updated["name_pl"] == "Wglad metaboliczny"

    delete_response = await async_client.delete(
        "/biomarker-lists/admin/templates/metabolic-insight"
    )
    assert delete_response.status_code == 204

    confirm_missing = await async_client.get(
        "/biomarker-lists/admin/templates/metabolic-insight"
    )
    assert confirm_missing.status_code == 404


@pytest.mark.asyncio
async def test_admin_endpoints_require_privileges(async_client: AsyncClient) -> None:
    response = await async_client.post("/users/session")
    assert response.status_code == 200

    forbidden = await async_client.post(
        "/biomarker-lists/admin/templates",
        json={
            "slug": "forbidden",
            "name_en": "Forbidden",
            "name_pl": "Zabronione",
            "description_en": None,
            "description_pl": None,
            "is_active": True,
            "biomarkers": [],
        },
    )
    assert forbidden.status_code == 403
