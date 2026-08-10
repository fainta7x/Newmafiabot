import asyncio
import logging
from typing import Any

import aiohttp

from config import BOT_API_BASE_URL, BOT_API_SECRET

logger = logging.getLogger(__name__)

BOT_API_TIMEOUT_SECONDS = 5.0


def _base_headers() -> dict[str, str]:
    return {"X-Bot-Token": BOT_API_SECRET}


def _achievement_payload_is_valid(data: Any) -> bool:
    if not isinstance(data, dict):
        return False
    player = data.get("player")
    achievements = data.get("achievements")
    if not isinstance(player, dict) or not isinstance(achievements, dict):
        return False
    if not all(key in achievements for key in ("earned", "total", "percentage", "categories")):
        return False
    categories = achievements.get("categories")
    if not isinstance(categories, list):
        return False
    for category in categories:
        if not isinstance(category, dict):
            return False
        if not all(key in category for key in ("id", "name", "icon", "order", "achievements")):
            return False
        if not isinstance(category.get("achievements"), list):
            return False
        for achievement in category["achievements"]:
            if not isinstance(achievement, dict):
                return False
            required = (
                "id", "name", "description", "icon", "rarity", "rarity_name",
                "rarity_icon", "earned", "earned_at", "progress",
            )
            if not all(key in achievement for key in required):
                return False
    return True


async def get_achievement_profile_by_telegram(telegram_user_id: int) -> dict[str, Any]:
    """Load the canonical achievement book for one Telegram account."""
    if not BOT_API_BASE_URL or not BOT_API_SECRET:
        logger.error("[Backend API] Achievement API configuration is incomplete")
        return {"success": False, "error": "configuration"}

    url = (
        f"{BOT_API_BASE_URL.rstrip('/')}"
        f"/api/bot/players/by-telegram/{int(telegram_user_id)}/achievements"
    )

    try:
        timeout = aiohttp.ClientTimeout(total=BOT_API_TIMEOUT_SECONDS)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(url, headers=_base_headers()) as response:
                status = response.status

                if status == 404:
                    return {"success": False, "error": "not_found", "status": status}

                if status in (401, 403):
                    logger.error("[Backend API] Achievement API authorization failed (status=%s)", status)
                    return {"success": False, "error": "authorization", "status": status}

                if status == 503 or status >= 500:
                    logger.warning("[Backend API] Achievement API unavailable (status=%s)", status)
                    return {"success": False, "error": "unavailable", "status": status}

                if status != 200:
                    logger.warning("[Backend API] Achievement API unexpected status=%s", status)
                    return {"success": False, "error": "unavailable", "status": status}

                try:
                    data = await response.json()
                except Exception as exc:
                    logger.warning(
                        "[Backend API] Achievement API returned malformed JSON (%s)",
                        type(exc).__name__,
                    )
                    return {"success": False, "error": "malformed", "status": status}

                if not _achievement_payload_is_valid(data):
                    logger.warning("[Backend API] Achievement API returned malformed payload")
                    return {"success": False, "error": "malformed", "status": status}

                return {"success": True, "data": data, "status": status}

    except asyncio.TimeoutError:
        logger.warning(
            "[Backend API] Achievement API timed out after %.1fs",
            BOT_API_TIMEOUT_SECONDS,
        )
        return {"success": False, "error": "timeout"}
    except aiohttp.ClientError as exc:
        logger.warning(
            "[Backend API] Achievement API connection failure (%s)",
            type(exc).__name__,
        )
        return {"success": False, "error": "unavailable"}
    except Exception as exc:
        logger.exception(
            "[Backend API] Unexpected achievement API failure (%s)",
            type(exc).__name__,
        )
        return {"success": False, "error": "unavailable"}


async def get_open_evenings() -> dict[str, Any]:
    """Load all canonical published/active evenings available to the bot."""
    if not BOT_API_BASE_URL or not BOT_API_SECRET:
        return {"success": False, "error": "configuration"}

    url = f"{BOT_API_BASE_URL.rstrip('/')}/api/bot/evenings/open"
    try:
        timeout = aiohttp.ClientTimeout(total=BOT_API_TIMEOUT_SECONDS)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(url, headers=_base_headers()) as response:
                status = response.status
                try:
                    data = await response.json()
                except Exception:
                    data = None
                if status == 200 and isinstance(data, list):
                    return {"success": True, "data": data, "status": status}
                if status in (401, 403):
                    return {"success": False, "error": "authorization", "status": status}
                if status == 503 or status >= 500:
                    return {"success": False, "error": "unavailable", "status": status}
                return {"success": False, "error": "invalid", "status": status}
    except asyncio.TimeoutError:
        return {"success": False, "error": "timeout"}
    except aiohttp.ClientError:
        return {"success": False, "error": "unavailable"}
    except Exception:
        logger.exception("[Backend API] Unexpected open evenings API failure")
        return {"success": False, "error": "unavailable"}


async def get_evening_participants(evening_id: str) -> dict[str, Any]:
    """Load one canonical CRM evening together with its participant state."""
    if not BOT_API_BASE_URL or not BOT_API_SECRET:
        return {"success": False, "error": "configuration"}

    url = f"{BOT_API_BASE_URL.rstrip('/')}/api/bot/evenings/{evening_id}/participants"
    try:
        timeout = aiohttp.ClientTimeout(total=BOT_API_TIMEOUT_SECONDS)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(url, headers=_base_headers()) as response:
                status = response.status
                try:
                    data = await response.json()
                except Exception:
                    data = None
                if status == 200 and isinstance(data, dict) and isinstance(data.get("participants"), list):
                    return {"success": True, "data": data, "status": status}
                if status == 404:
                    return {"success": False, "error": "not_found", "status": status}
                if status in (401, 403):
                    return {"success": False, "error": "authorization", "status": status}
                if status == 503 or status >= 500:
                    return {"success": False, "error": "unavailable", "status": status}
                return {"success": False, "error": "invalid", "status": status}
    except asyncio.TimeoutError:
        return {"success": False, "error": "timeout"}
    except aiohttp.ClientError:
        return {"success": False, "error": "unavailable"}
    except Exception:
        logger.exception("[Backend API] Unexpected evening participants API failure")
        return {"success": False, "error": "unavailable"}


async def submit_evening_response(evening_id: str, telegram_user_id: int, response_status: str) -> dict[str, Any]:
    """Submit one canonical CRM-evening response for a Telegram account."""
    if not BOT_API_BASE_URL or not BOT_API_SECRET:
        logger.error("[Backend API] Evening response API configuration is incomplete")
        return {"success": False, "error": "configuration"}

    url = f"{BOT_API_BASE_URL.rstrip('/')}/api/bot/evenings/{evening_id}/respond"
    payload = {
        "telegram_user_id": int(telegram_user_id),
        "response_status": response_status,
    }

    try:
        timeout = aiohttp.ClientTimeout(total=BOT_API_TIMEOUT_SECONDS)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(url, headers=_base_headers(), json=payload) as response:
                status = response.status
                try:
                    data = await response.json()
                except Exception:
                    data = None

                if status == 200 and isinstance(data, dict) and data.get("success") is True:
                    return {"success": True, "data": data, "status": status}
                if status == 404:
                    return {"success": False, "error": "not_found", "status": status}
                if status == 409:
                    return {"success": False, "error": "closed", "status": status}
                if status in (400, 422):
                    return {"success": False, "error": "invalid", "status": status}
                if status in (401, 403):
                    logger.error("[Backend API] Evening response authorization failed (status=%s)", status)
                    return {"success": False, "error": "authorization", "status": status}
                if status == 503 or status >= 500:
                    logger.warning("[Backend API] Evening response API unavailable (status=%s)", status)
                    return {"success": False, "error": "unavailable", "status": status}

                logger.warning("[Backend API] Evening response API unexpected status=%s", status)
                return {"success": False, "error": "unavailable", "status": status}

    except asyncio.TimeoutError:
        logger.warning(
            "[Backend API] Evening response API timed out after %.1fs",
            BOT_API_TIMEOUT_SECONDS,
        )
        return {"success": False, "error": "timeout"}
    except aiohttp.ClientError as exc:
        logger.warning(
            "[Backend API] Evening response API connection failure (%s)",
            type(exc).__name__,
        )
        return {"success": False, "error": "unavailable"}
    except Exception as exc:
        logger.exception(
            "[Backend API] Unexpected evening response API failure (%s)",
            type(exc).__name__,
        )
        return {"success": False, "error": "unavailable"}


async def check_backend_connection() -> dict:
    """
    Checks the connection to the Express Webapp backend.
    Returns a dict with check details.
    """
    if not BOT_API_SECRET:
        return {
            "success": False,
            "message": "BOT_API_SECRET is not configured",
            "service": None,
            "api_version": None,
        }

    url = f"{BOT_API_BASE_URL.rstrip('/')}/api/bot/health"
    headers = _base_headers()

    try:
        timeout = aiohttp.ClientTimeout(total=BOT_API_TIMEOUT_SECONDS)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(url, headers=headers) as response:
                if response.status == 200:
                    try:
                        data = await response.json()
                        if data.get("status") == "ok":
                            return {
                                "success": True,
                                "message": "Successfully connected to backend",
                                "service": data.get("service"),
                                "api_version": data.get("api_version"),
                            }
                        return {
                            "success": False,
                            "message": "Unexpected backend response format",
                            "service": None,
                            "api_version": None,
                        }
                    except Exception:
                        return {
                            "success": False,
                            "message": "Failed to parse JSON from backend",
                            "service": None,
                            "api_version": None,
                        }
                if response.status == 401:
                    return {
                        "success": False,
                        "message": "Backend authorization failed (401 Unauthorized)",
                        "service": None,
                        "api_version": None,
                    }
                if response.status == 503:
                    return {
                        "success": False,
                        "message": "Backend API service is unavailable (503 Service Unavailable)",
                        "service": None,
                        "api_version": None,
                    }
                return {
                    "success": False,
                    "message": f"Backend returned unexpected status code: {response.status}",
                    "service": None,
                    "api_version": None,
                }
    except asyncio.TimeoutError:
        return {
            "success": False,
            "message": f"Connection timed out after {BOT_API_TIMEOUT_SECONDS:.1f} seconds",
            "service": None,
            "api_version": None,
        }
    except aiohttp.ClientError as exc:
        return {
            "success": False,
            "message": f"Network / connection error: {type(exc).__name__}",
            "service": None,
            "api_version": None,
        }
    except Exception as exc:
        return {
            "success": False,
            "message": f"Unexpected error while checking backend: {type(exc).__name__}",
            "service": None,
            "api_version": None,
        }
