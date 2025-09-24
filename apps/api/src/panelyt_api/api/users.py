from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response, status

from panelyt_api.api.deps import SessionDep
from panelyt_api.core.settings import get_settings
from panelyt_api.schemas.accounts import Credentials, SessionResponse
from panelyt_api.services.accounts import AccountService

router = APIRouter(prefix="/users", tags=["users"])


@router.post("/session", response_model=SessionResponse)
async def ensure_user_session(
    request: Request,
    response: Response,
    db: SessionDep,
) -> SessionResponse:
    settings = get_settings()
    account_service = AccountService(db, settings=settings)
    token = request.cookies.get(settings.session_cookie_name)
    session_state = await account_service.ensure_session(token)
    account_service.apply_cookie(response, session_state.token)
    user = session_state.user
    return SessionResponse(
        user_id=user.id,
        username=user.username,
        registered=user.username is not None,
    )


@router.post("/register", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def register_user(
    credentials: Credentials,
    request: Request,
    response: Response,
    db: SessionDep,
) -> SessionResponse:
    settings = get_settings()
    account_service = AccountService(db, settings=settings)
    token = request.cookies.get(settings.session_cookie_name)
    session_state = await account_service.ensure_session(token)
    try:
        session_state = await account_service.register(
            session_state=session_state,
            username=credentials.username,
            password=credentials.password,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    account_service.apply_cookie(response, session_state.token)
    user = session_state.user
    return SessionResponse(user_id=user.id, username=user.username, registered=True)


@router.post("/login", response_model=SessionResponse)
async def login_user(
    credentials: Credentials,
    response: Response,
    db: SessionDep,
) -> SessionResponse:
    settings = get_settings()
    account_service = AccountService(db, settings=settings)
    try:
        session_state = await account_service.login(
            username=credentials.username,
            password=credentials.password,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    account_service.apply_cookie(response, session_state.token)
    user = session_state.user
    return SessionResponse(
        user_id=user.id,
        username=user.username,
        registered=user.username is not None,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout_user(
    request: Request,
    response: Response,
    db: SessionDep,
) -> None:
    settings = get_settings()
    account_service = AccountService(db, settings=settings)
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        return
    session_state = await account_service.get_active_session(token)
    if session_state is None:
        response.delete_cookie(
            account_service.cookie_name,
            domain=settings.session_cookie_domain,
            path="/",
        )
        return
    await account_service.logout(session_state.session)
    response.delete_cookie(
        account_service.cookie_name,
        domain=settings.session_cookie_domain,
        path="/",
    )
