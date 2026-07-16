"""Pydantic (v2) request/response models."""
import re
from typing import List

from pydantic import BaseModel, Field, field_validator

SHORTCODE_RE = re.compile(r"^[a-zA-Z0-9_-]{3,32}$")


class CreatePollRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    options: List[str] = Field(..., min_length=2, max_length=20)
    shortcode: str = Field(..., min_length=3, max_length=32)

    @field_validator("shortcode")
    @classmethod
    def valid_shortcode(cls, v: str) -> str:
        v = v.strip()
        if not SHORTCODE_RE.match(v):
            raise ValueError(
                "Shortcode must be 3-32 chars: letters, numbers, hyphen, underscore."
            )
        return v.lower()

    @field_validator("options")
    @classmethod
    def clean_options(cls, v: List[str]) -> List[str]:
        cleaned = [o.strip() for o in v if o and o.strip()]
        if len(cleaned) < 2:
            raise ValueError("At least 2 non-empty options are required.")
        if len(set(cleaned)) != len(cleaned):
            raise ValueError("Options must be unique.")
        return cleaned

    @field_validator("title")
    @classmethod
    def clean_title(cls, v: str) -> str:
        return v.strip()


class VoteRequest(BaseModel):
    voter: str = Field(..., min_length=1, max_length=60)
    ranking: List[int] = Field(..., min_length=1)

    @field_validator("voter")
    @classmethod
    def clean_voter(cls, v: str) -> str:
        return v.strip()
