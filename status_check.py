"""Runtime status checks exposed for Telegram admin diagnostics."""

import asyncio
import time

import aiohttp

import config

STATUS_TIMEOUT_SECONDS = 5
STARTED_AT = time.time()


async def check_application_status() -> dict:
    result = {
        "bot": "🟢 работает",
        "backend": "⚪ не проверен",
        "database": "⚪ через backend",
        "uptime": _uptime(),
    }

    if not config.BOT_API_BASE_URL or not config.BOT_API_SECRET:
        result["backend"] = "🔴 API не настроен"
        return result

    try:
        timeout = aiohttp.ClientTimeout(total=STATUS_TIMEOUT_SECONDS)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(
                f"{config.BOT_API_BASE_URL.rstrip('/')}/api/bot/health",
                headers={"X-Bot-Token": config.BOT_API_SECRET},
            ) as response:
                if response.status == 200:
                    result["backend"] = "🟢 доступен"
                    result["database"] = "🟢 проверена"
                else:
                    result["backend"] = f"🔴 HTTP {response.status}"
    except asyncio.TimeoutError:
        result["backend"] = "🔴 таймаут"
    except Exception as exc:
        result["backend"] = f"🔴 {type(exc).__name__}"

    return result


def _uptime() -> str:
    seconds = int(time.time() - STARTED_AT)
    minutes, sec = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    return f"{hours}ч {minutes}м {sec}с"


def format_status_message(status: dict) -> str:
    return (
        "🩺 <b>Состояние приложения</b>\n\n"
        f"Бот: {status['bot']}\n"
        f"Backend: {status['backend']}\n"
        f"База: {status['database']}\n"
        f"Uptime: {status['uptime']}"
    )
