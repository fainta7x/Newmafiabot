"""The cover picture shown above evening announcements (owner request 2026-09-29).

Telegram shows it as a large link preview above the text, so the post stays a plain text
message: it keeps the 4096-character limit and can still be edited in place. The pictures
live in the web app (`public/announce/*.jpg`, drawn by `scripts/generateAnnouncementCovers.py`).
"""
from aiogram.types import LinkPreviewOptions

import config

# Bump when the pictures change, so Telegram fetches the new file instead of its cached preview.
COVER_VERSION = "1"

_COVER_BY_FORMAT = {
    "NOVICE": "novice",
    "CASUAL": "club",
    "STANDARD": "club",
    "RATING": "rating",
    "TOURNAMENT": "rating",
}


def evening_cover_url(evening: dict) -> str | None:
    base = str(getattr(config, "PLAYER_APP_URL", "") or "").rstrip("/")
    if not base.startswith("https://"):
        return None
    canonical_format = str(evening.get("canonical_format") or evening.get("format") or "CASUAL").upper()
    name = _COVER_BY_FORMAT.get(canonical_format, "club")
    return f"{base}/announce/{name}.jpg?v={COVER_VERSION}"


def cover_preview(evening: dict) -> LinkPreviewOptions:
    """A large cover above the text, or no preview at all when the app address is unknown."""
    url = evening_cover_url(evening)
    if not url:
        return LinkPreviewOptions(is_disabled=True)
    return LinkPreviewOptions(url=url, prefer_large_media=True, show_above_text=True)
