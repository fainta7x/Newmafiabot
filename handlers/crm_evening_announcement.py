import asyncio
import datetime

from aiogram import Bot

from bot_announcement_api import (
    get_evening_announcement_recipients,
    get_evening_reminder_recipients,
    save_evening_announcement_delivery,
    save_evening_announcement_failure,
    save_evening_announcement_state,
    save_evening_reminder_attempt,
)
from crm_evening_keyboard import crm_evening_response_kb
from handlers.crm_booking import _evening_prompt
from handlers.crm_telegram_publishing import sync_evening_telegram


async def send_crm_evening_announcement(bot: Bot, evening_id: str) -> dict:
    """Synchronize public/thematic Telegram posts and send filtered private invitations."""
    group_result = await sync_evening_telegram(bot, evening_id)
    if not group_result.get("success"):
        return group_result

    recipients_result = await get_evening_announcement_recipients(evening_id)
    if not recipients_result.get("success"):
        return {
            "success": False,
            "error": recipients_result.get("error") or "recipients_unavailable",
            "group": group_result,
        }

    payload = recipients_result.get("data") or {}
    evening = payload.get("evening") or {}
    recipients = payload.get("recipients") or []

    sent = 0
    failed = 0
    state_failures = 0
    failed_players = []

    for recipient in recipients:
        player_id = str(recipient.get("id") or "").strip()
        telegram_user_id = str(recipient.get("telegram_user_id") or "").strip()
        nickname = str(recipient.get("nickname") or "Игрок")
        if not player_id or not telegram_user_id:
            continue

        try:
            message = await bot.send_message(
                int(telegram_user_id),
                _evening_prompt(evening),
                parse_mode="HTML",
                reply_markup=crm_evening_response_kb(evening_id),
            )
        except Exception as exc:
            failed += 1
            failed_players.append(nickname)
            await save_evening_announcement_failure(
                evening_id=evening_id,
                player_id=player_id,
                telegram_user_id=telegram_user_id,
                error=str(exc),
            )
            print(f"[CRM ANNOUNCE] Private delivery failed for {nickname} ({telegram_user_id}): {exc}")
            await asyncio.sleep(0.05)
            continue

        delivery = await save_evening_announcement_delivery(
            evening_id=evening_id,
            player_id=player_id,
            telegram_user_id=telegram_user_id,
            telegram_message_id=message.message_id,
        )
        if not delivery.get("success"):
            state_failures += 1
            print(f"[CRM ANNOUNCE] Failed to persist private delivery for {nickname}")
        else:
            sent += 1
        await asyncio.sleep(0.05)

    if failed == 0 and state_failures == 0:
        await save_evening_announcement_state(
            evening_id,
            dm_sent_at=datetime.datetime.now().astimezone().isoformat(),
        )

    return {
        "success": True,
        "evening_id": evening_id,
        "group": group_result,
        "dm": {
            "eligible_remaining_before_send": len(recipients),
            "sent": sent,
            "failed": failed,
            "delivery_state_failures": state_failures,
            "failed_players": failed_players,
        },
    }


async def send_crm_evening_reminders(bot: Bot, evening_id: str) -> dict:
    """Remind only players who received the first invitation and still have no response."""
    recipients_result = await get_evening_reminder_recipients(evening_id)
    if not recipients_result.get("success"):
        return {
            "success": False,
            "error": recipients_result.get("error") or "recipients_unavailable",
        }

    payload = recipients_result.get("data") or {}
    evening = payload.get("evening") or {}
    recipients = payload.get("recipients") or []
    sent = 0
    failed = 0
    failed_players = []

    for recipient in recipients:
        player_id = str(recipient.get("id") or "").strip()
        telegram_user_id = str(recipient.get("telegram_user_id") or "").strip()
        nickname = str(recipient.get("nickname") or "Игрок")
        if not player_id or not telegram_user_id:
            continue

        try:
            message = await bot.send_message(
                int(telegram_user_id),
                "🔔 <b>Напоминание об игровом вечере</b>\n\n"
                "Ты ещё не ответил на приглашение. Получится прийти?\n\n"
                + _evening_prompt(evening),
                parse_mode="HTML",
                reply_markup=crm_evening_response_kb(evening_id),
            )
        except Exception as exc:
            failed += 1
            failed_players.append(nickname)
            await save_evening_reminder_attempt(
                evening_id,
                player_id,
                telegram_user_id,
                success=False,
                error=str(exc),
            )
            print(f"[CRM REMINDER] Delivery failed for {nickname} ({telegram_user_id}): {exc}")
            await asyncio.sleep(0.05)
            continue

        await save_evening_reminder_attempt(
            evening_id,
            player_id,
            telegram_user_id,
            success=True,
            telegram_message_id=message.message_id,
        )
        sent += 1
        await asyncio.sleep(0.05)

    return {
        "success": True,
        "evening_id": evening_id,
        "eligible": len(recipients),
        "sent": sent,
        "failed": failed,
        "failed_players": failed_players,
    }
