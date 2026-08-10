import asyncio
import logging
from typing import Any

import aiohttp

from config import BOT_API_BASE_URL, BOT_API_SECRET

logger = logging.getLogger(__name__)
_TIMEOUT_SECONDS = 5.0


def _headers() -> dict[str, str]:
    return {"X-Bot-Token": BOT_API_SECRET}


async def get_evening_announcement_state(evening_id: str) -> dict[str, Any]:
    if not BOT_API_BASE_URL or not BOT_API_SECRET:
        return {"success": False, "error": "configuration"}

    url = f"{BOT_API_BASE_URL.rstrip('/')}/api/bot/evenings/{evening_id}/announcement-state"
    try:
        timeout = aiohttp.ClientTimeout(total=_TIMEOUT_SECONDS)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(url, headers=_headers()) as response:
                status = response.status
                try:
                    data = await response.json()
                except Exception:
                    data = None
                if status == 200 and isinstance(data, dict):
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
        logger.exception("[Backend API] Failed to read announcement state")
        return {"success": False, "error": "unavailable"}


async def save_evening_announcement_state(evening_id: str, **fields: Any) -> dict[str, Any]:
    if not BOT_API_BASE_URL or not BOT_API_SECRET:
        return {"success": False, "error": "configuration"}
    if not fields:
        return {"success": False, "error": "invalid"}

    url = f"{BOT_API_BASE_URL.rstrip('/')}/api/bot/evenings/{evening_id}/announcement-state"
    try:
        timeout = aiohttp.ClientTimeout(total=_TIMEOUT_SECONDS)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.patch(url, headers=_headers(), json=fields) as response:
                status = response.status
                try:
                    data = await response.json()
                except Exception:
                    data = None
                if status == 200 and isinstance(data, dict) and data.get("success") is True:
                    return {"success": True, "data": data, "status": status}
                if status == 404:
                    return {"success": False, "error": "not_found", "status": status}
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
        logger.exception("[Backend API] Failed to save announcement state")
        return {"success": False, "error": "unavailable"}
