from __future__ import annotations

from pydantic import BaseModel, Field


class Credentials(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    password: str = Field(..., min_length=8, max_length=128)


class SessionResponse(BaseModel):
    user_id: str = Field(..., description="Identifier of the current user")
    username: str | None = Field(
        default=None,
        description="Username if the user registered, otherwise null",
    )
    registered: bool = Field(
        default=False,
        description="Whether the current user has credentials set",
    )
    is_admin: bool = Field(default=False, description="True when the user has admin privileges")


__all__ = ["Credentials", "SessionResponse"]
