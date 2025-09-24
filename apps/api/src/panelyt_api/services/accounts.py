from __future__ import annotations

import hashlib
import re
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Final

from argon2 import PasswordHasher
from argon2 import exceptions as argon2_exceptions
from fastapi import Response
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from panelyt_api.core.settings import Settings, get_settings
from panelyt_api.db.models import UserAccount, UserSession


@dataclass
class SessionState:
    """Active session information for authenticated requests."""

    user: UserAccount
    session: UserSession
    token: str


class AccountService:
    """Service for managing lightweight user accounts and sessions."""

    _USERNAME_PATTERN: Final[re.Pattern[str]] = re.compile(r"^[a-z0-9][a-z0-9_-]{1,62}[a-z0-9]$")
    _PASSWORD_MIN_LENGTH: Final[int] = 8

    def __init__(self, db: AsyncSession, settings: Settings | None = None) -> None:
        self._db = db
        self._settings = settings or get_settings()
        self._session_ttl = timedelta(days=self._settings.session_cookie_ttl_days)
        self.cookie_name = self._settings.session_cookie_name
        self.cookie_max_age = int(self._session_ttl.total_seconds())
        self._password_hasher = PasswordHasher()

    async def ensure_session(self, token: str | None) -> SessionState:
        now = datetime.now(UTC)
        if token:
            existing = await self._fetch_session(token)
            if existing is not None:
                expires_at = self._as_utc(existing.expires_at)
                if expires_at >= now:
                    existing.last_seen_at = now
                    existing.expires_at = now + self._session_ttl
                    await self._db.flush()
                    return SessionState(user=existing.user, session=existing, token=token)

                new_token = self._generate_token()
                existing.token_hash = self._hash_token(new_token)
                existing.expires_at = now + self._session_ttl
                existing.last_seen_at = now
                await self._db.flush()
                return SessionState(user=existing.user, session=existing, token=new_token)

        user = UserAccount()
        self._db.add(user)
        await self._db.flush()

        session_state = await self._create_session(user)
        return session_state

    async def register(
        self,
        session_state: SessionState,
        username: str,
        password: str,
    ) -> SessionState:
        normalized = self._normalize_username(username)
        self._validate_password(password)

        existing = await self._db.execute(
            select(UserAccount).where(UserAccount.username == normalized)
        )
        owner = existing.scalar_one_or_none()
        user = session_state.user

        if owner is not None and owner.id != user.id:
            raise ValueError("Username already taken")

        if user.username is not None:
            raise ValueError("Username already taken")

        user.username = normalized
        user.password_hash = self._hash_password(password)
        await self._db.flush()

        return SessionState(user=user, session=session_state.session, token=session_state.token)

    async def login(self, username: str, password: str) -> SessionState:
        normalized = self._normalize_username(username)
        result = await self._db.execute(
            select(UserAccount).where(UserAccount.username == normalized)
        )
        user = result.scalar_one_or_none()
        if user is None:
            raise ValueError("Invalid credentials")

        if not user.password_hash or not self._verify_password(user.password_hash, password):
            raise ValueError("Invalid credentials")

        session_state = await self._create_session(user)
        return session_state

    async def logout(self, session: UserSession) -> None:
        await self._db.execute(
            delete(UserSession).where(UserSession.id == session.id)
        )
        await self._db.flush()

    async def get_active_session(self, token: str) -> SessionState | None:
        """Return an active session for a token, refreshing its timestamps."""

        now = datetime.now(UTC)
        existing = await self._fetch_session(token)
        if existing is None:
            return None

        expires_at = self._as_utc(existing.expires_at)
        if expires_at < now:
            return None

        existing.last_seen_at = now
        existing.expires_at = now + self._session_ttl
        await self._db.flush()

        return SessionState(
            user=existing.user,
            session=existing,
            token=token,
        )

    def apply_cookie(self, response: Response, token: str) -> None:
        """Attach the session cookie to the response."""

        response.set_cookie(
            key=self.cookie_name,
            value=token,
            max_age=self.cookie_max_age,
            httponly=True,
            secure=self._settings.session_cookie_secure,
            samesite="lax",
            path="/",
            domain=self._settings.session_cookie_domain,
        )

    async def _fetch_session(self, token: str) -> UserSession | None:
        stmt = (
            select(UserSession)
            .options(selectinload(UserSession.user))
            .where(UserSession.token_hash == self._hash_token(token))
        )
        result = await self._db.execute(stmt)
        return result.scalar_one_or_none()

    async def _create_session(self, user: UserAccount) -> SessionState:
        now = datetime.now(UTC)
        token = self._generate_token()
        session_model = UserSession(
            user_id=user.id,
            token_hash=self._hash_token(token),
            expires_at=now + self._session_ttl,
            last_seen_at=now,
        )
        self._db.add(session_model)
        await self._db.flush()
        return SessionState(user=user, session=session_model, token=token)

    def _hash_password(self, password: str) -> str:
        return self._password_hasher.hash(password)

    def _verify_password(self, stored_hash: str, candidate: str) -> bool:
        try:
            return self._password_hasher.verify(stored_hash, candidate)
        except (argon2_exceptions.VerifyMismatchError, argon2_exceptions.InvalidHash):
            return False

    @staticmethod
    def _hash_token(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    @staticmethod
    def _generate_token() -> str:
        return secrets.token_urlsafe(32)

    @staticmethod
    def _as_utc(dt: datetime) -> datetime:
        if dt.tzinfo is None:
            return dt.replace(tzinfo=UTC)
        return dt.astimezone(UTC)

    def _normalize_username(self, username: str) -> str:
        normalized = username.strip().lower()
        if not normalized:
            raise ValueError("Username cannot be blank")
        if not self._USERNAME_PATTERN.match(normalized):
            raise ValueError(
                "Username must be 3-64 characters of a-z, 0-9, underscores or hyphens"
            )
        return normalized

    def _validate_password(self, password: str) -> None:
        if len(password) < self._PASSWORD_MIN_LENGTH:
            raise ValueError("Password must be at least 8 characters long")


__all__ = [
    "AccountService",
    "SessionState",
]
