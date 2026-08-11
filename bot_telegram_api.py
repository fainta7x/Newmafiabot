import asyncio
import logging
from typing import Any

import aiohttp

from config import BOT_API_BASE_URL, BOT_API_SECRET

logger = logging.getLogger(__name__)
_TIMEOUT_SECONDS = 8.0


def _headers() -> dict[str, str]:
    return {"X-Bot-Token": BOT_API_SECRET, "Content-Type": "application/json"}


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
                if 200 <= status < 300:
                    return {"success": True, "data": data, "status": status}
                if status == 404:
                    return {"success": False, "error": "not_found", "data": data, "status": status}
                if status in (401, 403):
                    return {"success": False, "error": "authorization", "data": data, "status": status}
                if status in (400, 409, 422):
                    return {"success": False, "error": "invalid", "data": data, "status": status}
                return {"success": False, "error": "unavailable", "data": data, "status": status}
    except asyncio.TimeoutError:
        return {"success": False, "error": "timeout"}
    except aiohttp.ClientError:
        return {"success": False, "error": "unavailable"}
    except Exception:
        logger.exception("[Telegram Publishing API] Backend request failed: %s %s", method, path)
        return {"success": False, "error": "unavailable"}


async def get_evening_telegram_plan(evening_id: str) -> dict[str, Any]:
    return await _request("GET", f"/api/bot/evenings/{evening_id}/telegram-plan")


async def save_evening_telegram_publication(
    evening_id: str,
    destination_id: str,
    chat_id: str | int,
    topic_id: int | None,
    message_id: int,
) -> dict[str, Any]:
    return await _request(
        "PUT",
        f"/api/bot/evenings/{evening_id}/telegram-publications/{destination_id}",
        {
            "chat_id": str(chat_id),
            "topic_id": topic_id,
            "message_id": int(message_id),
        },
    )


async def get_tournament_telegram_plan(tournament_id: str) -> dict[str, Any]:
    return await _request("GET", f"/api/bot/tournaments/{tournament_id}/telegram-plan")


async def save_tournament_telegram_publication(
    tournament_id: str,
    destination_id: str,
    chat_id: str | int,
    message_id: int,
) -> dict[str, Any]:
    return await _request(
        "PUT",
        f"/api/bot/tournaments/{tournament_id}/telegram-publications/{destination_id}",
        {
            "chat_id": str(chat_id),
            "message_id": int(message_id),
        },
    )


async def get_public_router_payload() -> dict[str, Any]:
    return await _request("GET", "/api/bot/telegram/public-router")


async def save_public_router_message_id(message_id: int | None) -> dict[str, Any]:
    return await _request(
        "PATCH",
        "/api/bot/telegram/public-router-state",
        {"router_message_id": message_id},
    )


async def get_telegram_destinations() -> dict[str, Any]:
    return await _request("GET", "/api/bot/telegram/settings")
