"""Fail/recovery alerts from the Python bot when its Node backend is unhealthy.

This complements, but does not replace, the external GitHub monitor: a process
inside Amvera cannot notify anyone if the entire Amvera container is down.
"""
import asyncio
import logging

import aiohttp
from aiogram import Bot

import config

logger = logging.getLogger(__name__)


async def _notify(bot: Bot, text: str) -> None:
    for chat_id in config.RUNTIME_ALERT_RECIPIENT_IDS:
        try:
            await bot.send_message(chat_id, text)
        except Exception as exc:
            logger.warning("Не удалось отправить runtime-уведомление %s: %s", chat_id, exc)


async def _check_runtime() -> tuple[bool, str]:
    """Probe the deep health endpoint, including Turso, instead of a shallow API ping."""
    if not config.BOT_API_BASE_URL:
        return False, 'BOT_API_BASE_URL is not configured'
    try:
        timeout = aiohttp.ClientTimeout(total=8)
        url = f"{config.BOT_API_BASE_URL.rstrip('/')}/api/health/runtime"
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(url, headers={'Accept': 'application/json'}) as response:
                try:
                    payload = await response.json()
                except Exception:
                    payload = {}
                if response.status == 200 and payload.get('status') == 'ok':
                    return True, 'ok'
                checks = payload.get('checks') if isinstance(payload, dict) else {}
                details = ', '.join(f"{name}={value}" for name, value in (checks or {}).items())
                return False, f'HTTP {response.status}' + (f' ({details})' if details else '')
    except asyncio.TimeoutError:
        return False, 'timeout'
    except aiohttp.ClientError as exc:
        return False, f'connection error: {type(exc).__name__}'
    except Exception as exc:
        return False, f'{type(exc).__name__}: {exc}'


async def runtime_alert_task(bot: Bot) -> None:
    """Send one failure alert after consecutive failures and one recovery alert."""
    failures = 0
    outage_reported = False
    await asyncio.sleep(10)

    while True:
        try:
            healthy, reason = await _check_runtime()
        except Exception as exc:  # The monitor must never take the bot down.
            healthy = False
            reason = f'{type(exc).__name__}: {exc}'

        if healthy:
            if outage_reported:
                await _notify(bot, '✅ 2LA Noire: связь бота с приложением и клубной базой восстановлена.')
            failures = 0
            outage_reported = False
        else:
            failures += 1
            if failures >= config.RUNTIME_ALERT_FAILURE_THRESHOLD and not outage_reported:
                await _notify(
                    bot,
                    '🚨 2LA Noire: приложение или клубная база недоступны. '
                    f'Бот продолжает работать. Причина: {reason}',
                )
                outage_reported = True
            logger.warning('Runtime backend health failed (%s/%s): %s', failures, config.RUNTIME_ALERT_FAILURE_THRESHOLD, reason)

        await asyncio.sleep(config.RUNTIME_ALERT_INTERVAL_SECONDS)
