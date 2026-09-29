"""The club photo shown above evening announcements (owner request 2026-09-29).

The organizer uploads photos in CRM «Публикации клуба» → «Фото для анонсов»; the server picks one
for each evening and sends its public address as `cover_url` with the evening. Telegram shows it
as a large link preview above the text, so the post stays a text message: it keeps the 4096-character
limit and can still be edited in place. Without photos the post has no preview, as before.
"""
from aiogram.types import LinkPreviewOptions


def cover_preview(evening: dict) -> LinkPreviewOptions:
    url = str((evening or {}).get("cover_url") or "").strip()
    if not url.startswith("https://"):
        return LinkPreviewOptions(is_disabled=True)
    return LinkPreviewOptions(url=url, prefer_large_media=True, show_above_text=True)
