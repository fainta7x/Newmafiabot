import asyncio
import logging
from typing import Any

import aiohttp

from config import BOT_API_BASE_URL, BOT_API_SECRET

logger = logging.getLogger(__name__)
_TIMEOUT_SECONDS = 5.0


def _headers() -> dict[str, str]:
    return {"X-Bot-Token": BOT_API_SECRET}


async def _request(method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    if not BOT_API_BASE_URL or not BOT_API_SECRET:
        return {"success": False, "error": "configuration"}
    url = f"{BOT_API_BASE_URL.rstrip('/')}{path}"
    try:
        timeout = aiohttp.ClientTimeout(total=_TIMEOUT_SECONDS)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.request(method, url, headers=_headers(), json=payload) as response:
                status = response.status
                try:
                    data = await response.json()
                except Exception:
                    data = None
                if 200 <= status < 300 and isinstance(data, dict):
                    return {"success": True, "data": data, "status": status}
                if status == 404:
                    return {"success": False, "error": "not_found", "data": data, "status": status}
                if status == 409:
                    return {"success": False, "error": "closed", "data": data, "status": status}
                if status in (400, 422):
                    return {"success": False, "error": "invalid", "data": data, "status": status}
                if status in (401, 403):
                    return {"success": False, "error": "authorization", "data": data, "status": status}
                return {"success": False, "error": "unavailable", "data": data, "status": status}
    except asyncio.TimeoutError:
        return {"success": False, "error": "timeout"}
    except aiohttp.ClientError:
        return {"success": False, "error": "unavailable"}
    except Exception:
        logger.exception("[Backend API] Announcement request failed: %s %s", method, path)
        return {"success": False, "error": "unavailable"}


async def get_evening_announcement_state(evening_id: str) -> dict[str, Any]:
    return await _request("GET", f"/api/bot/evenings/{evening_id}/announcement-state")


async def get_evening_recruitment_state(evening_id: str) -> dict[str, Any]:
    return await _request("GET", f"/api/bot/evenings/{evening_id}/recruitment-state")


async def save_evening_announcement_state(evening_id: str, **fields: Any) -> dict[str, Any]:
    if not fields:
        return {"success": False, "error": "invalid"}
    return await _request("PATCH", f"/api/bot/evenings/{evening_id}/announcement-state", fields)


async def get_evening_announcement_recipients(evening_id: str) -> dict[str, Any]:
    result = await _request("GET", f"/api/bot/evenings/{evening_id}/announcement-recipients")
    if result.get("success") and not isinstance((result.get("data") or {}).get("recipients"), list):
        return {"success": False, "error": "unavailable"}
    return result


async def save_evening_announcement_delivery(
    evening_id: str,
    player_id: str,
    telegram_user_id: str,
    telegram_message_id: int,
) -> dict[str, Any]:
    return await _request(
        "POST",
        f"/api/bot/evenings/{evening_id}/announcement-delivery",
        {
            "player_id": player_id,
            "telegram_user_id": telegram_user_id,
            "telegram_message_id": int(telegram_message_id),
        },
    )


async def save_evening_announcement_failure(
    evening_id: str,
    player_id: str,
    telegram_user_id: str,
    error: str,
) -> dict[str, Any]:
    return await _request(
        "POST",
        f"/api/bot/evenings/{evening_id}/announcement-delivery-failure",
        {
            "player_id": player_id,
            "telegram_user_id": telegram_user_id,
            "error": str(error)[:1000],
        },
    )


async def get_evening_reminder_recipients(evening_id: str) -> dict[str, Any]:
    result = await _request("GET", f"/api/bot/evenings/{evening_id}/reminder-recipients")
    if result.get("success") and not isinstance((result.get("data") or {}).get("recipients"), list):
        return {"success": False, "error": "unavailable"}
    return result


async def save_evening_reminder_attempt(
    evening_id: str,
    player_id: str,
    telegram_user_id: str,
    *,
    success: bool,
    telegram_message_id: int | None = None,
    error: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "player_id": player_id,
        "telegram_user_id": telegram_user_id,
        "success": bool(success),
    }
    if telegram_message_id is not None:
        payload["telegram_message_id"] = int(telegram_message_id)
    if error:
        payload["error"] = str(error)[:1000]
    return await _request("POST", f"/api/bot/evenings/{evening_id}/reminder-attempt", payload)
