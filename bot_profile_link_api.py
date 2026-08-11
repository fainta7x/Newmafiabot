import asyncio
import logging
from typing import Any

import aiohttp

from config import BOT_API_BASE_URL, BOT_API_SECRET

logger = logging.getLogger(__name__)
_TIMEOUT_SECONDS = 5.0


def _headers() -> dict[str, str]:
    return {"X-Bot-Token": BOT_API_SECRET}


async def get_canonical_profile(telegram_user_id: int) -> dict[str, Any]:
    if not BOT_API_BASE_URL or not BOT_API_SECRET:
        return {"success": False, "error": "configuration"}

    url = f"{BOT_API_BASE_URL.rstrip('/')}/api/bot/players/by-telegram/{int(telegram_user_id)}/profile"
    try:
        timeout = aiohttp.ClientTimeout(total=_TIMEOUT_SECONDS)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(url, headers=_headers()) as response:
                status = response.status
                try:
                    data = await response.json()
                except Exception:
                    data = None
                if status == 200 and isinstance(data, dict) and data.get("success") is True:
                    return {"success": True, "data": data, "status": status}
                if status == 404:
                    return {"success": False, "error": "not_found", "status": status}
                if status in (401, 403):
                    return {"success": False, "error": "authorization", "status": status}
                return {"success": False, "error": "unavailable", "status": status}
    except asyncio.TimeoutError:
        return {"success": False, "error": "timeout"}
    except aiohttp.ClientError:
        return {"success": False, "error": "unavailable"}
    except Exception:
        logger.exception("[Backend API] Failed to load canonical player profile")
        return {"success": False, "error": "unavailable"}


async def register_canonical_profile(
    telegram_user_id: int,
    telegram_username: str | None,
    full_name: str | None,
    nickname: str,
) -> dict[str, Any]:
    if not BOT_API_BASE_URL or not BOT_API_SECRET:
        return {"success": False, "error": "configuration"}

    url = f"{BOT_API_BASE_URL.rstrip('/')}/api/bot/players/register"
    payload = {
        "telegram_user_id": int(telegram_user_id),
        "telegram_username": telegram_username or "",
        "full_name": full_name or "",
        "nickname": nickname,
    }

    try:
        timeout = aiohttp.ClientTimeout(total=_TIMEOUT_SECONDS)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(url, headers=_headers(), json=payload) as response:
                status = response.status
                try:
                    data = await response.json()
                except Exception:
                    data = None
                if status in (200, 201) and isinstance(data, dict) and data.get("success") is True:
                    return {"success": True, "data": data, "status": status}
                if status == 409:
                    code = data.get("code") if isinstance(data, dict) else None
                    return {"success": False, "error": code or "conflict", "status": status, "data": data}
                if status in (400, 422):
                    code = data.get("code") if isinstance(data, dict) else None
                    return {"success": False, "error": code or "invalid", "status": status, "data": data}
                if status in (401, 403):
                    return {"success": False, "error": "authorization", "status": status}
                return {"success": False, "error": "unavailable", "status": status}
    except asyncio.TimeoutError:
        return {"success": False, "error": "timeout"}
    except aiohttp.ClientError:
        return {"success": False, "error": "unavailable"}
    except Exception:
        logger.exception("[Backend API] Failed to register canonical player profile")
        return {"success": False, "error": "unavailable"}


async def link_legacy_profile(
    telegram_user_id: int,
    telegram_username: str | None,
    nickname: str,
) -> dict[str, Any]:
    if not BOT_API_BASE_URL or not BOT_API_SECRET:
        return {"success": False, "error": "configuration"}

    url = f"{BOT_API_BASE_URL.rstrip('/')}/api/bot/players/link-telegram"
    payload = {
        "telegram_user_id": int(telegram_user_id),
        "telegram_username": telegram_username or "",
        "nickname": nickname,
    }

    try:
        timeout = aiohttp.ClientTimeout(total=_TIMEOUT_SECONDS)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(url, headers=_headers(), json=payload) as response:
                status = response.status
                try:
                    data = await response.json()
                except Exception:
                    data = None

                if status == 200 and isinstance(data, dict) and data.get("success") is True:
                    return {"success": True, "data": data, "status": status}
                if status == 404:
                    return {"success": False, "error": "profile_not_found", "status": status}
                if status == 409:
                    code = data.get("code") if isinstance(data, dict) else None
                    return {"success": False, "error": code or "conflict", "status": status}
                if status in (400, 422):
                    return {"success": False, "error": "invalid", "status": status}
                if status in (401, 403):
                    return {"success": False, "error": "authorization", "status": status}
                return {"success": False, "error": "unavailable", "status": status}
    except asyncio.TimeoutError:
        return {"success": False, "error": "timeout"}
    except aiohttp.ClientError:
        return {"success": False, "error": "unavailable"}
    except Exception:
        logger.exception("[Backend API] Failed to link legacy player profile")
        return {"success": False, "error": "unavailable"}
