import asyncio
import datetime

from aiogram import Bot

import bot_menu
from bot_announcement_api import (
    get_evening_announcement_recipients,
    get_evening_reminder_recipients,
    save_evening_announcement_delivery,
    save_evening_announcement_failure,
    save_evening_announcement_state,
    save_evening_reminder_attempt,
)
from crm_evening_keyboard import crm_evening_response_kb
from handlers.crm_telegram_publishing import sync_evening_telegram
from handlers.telegram_evening_copy import private_event_text


def _event_url(evening_id: str) -> str | None:
    markup = bot_menu.event_inline_keyboard(evening_id)
    try:
        return markup.inline_keyboard[0][0].url
    except (AttributeError, IndexError, TypeError):
        return None


def _response_keyboard(evening_id: str):
    return crm_evening_response_kb(evening_id, event_url=_event_url(evening_id))


async def _retry_backend_write(operation, attempts: int = 3) -> dict:
    """Reduce the at-least-once gap between Telegram delivery and backend delivery state."""
    result = {"success": False, "error": "backend_write_failed"}
    for attempt in range(max(1, attempts)):
        try:
            result = await operation()
        except Exception as exc:
            result = {"success": False, "error": str(exc)}
        if result.get("success"):
            return result
        if attempt + 1 < attempts:
            await asyncio.sleep(0.2 * (attempt + 1))
    return result


async def send_crm_evening_announcement(bot: Bot, evening_id: str) -> dict:
    """Synchronize Telegram posts and send private invitations with one-tap RSVP."""
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
    response_keyboard = _response_keyboard(evening_id)
    invitation_text = private_event_text(evening)

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
                invitation_text,
                parse_mode="HTML",
                reply_markup=response_keyboard,
            )
        except Exception as exc:
            failed += 1
            failed_players.append(nickname)
            persisted = await _retry_backend_write(lambda: save_evening_announcement_failure(
                evening_id=evening_id,
                player_id=player_id,
                telegram_user_id=telegram_user_id,
                error=str(exc),
            ))
            if not persisted.get("success"):
                state_failures += 1
            print(f"[CRM ANNOUNCE] Private delivery failed for {nickname} ({telegram_user_id}): {exc}")
            await asyncio.sleep(0.05)
            continue

        delivery = await _retry_backend_write(lambda: save_evening_announcement_delivery(
            evening_id=evening_id,
            player_id=player_id,
            telegram_user_id=telegram_user_id,
            telegram_message_id=message.message_id,
        ))
        if not delivery.get("success"):
            state_failures += 1
            print(f"[CRM ANNOUNCE] Failed to persist private delivery for {nickname}")
        else:
            sent += 1
        await asyncio.sleep(0.05)

    if failed == 0 and state_failures == 0:
        await _retry_backend_write(lambda: save_evening_announcement_state(
            evening_id,
            dm_sent_at=datetime.datetime.now().astimezone().isoformat(),
        ))

    success = failed == 0 and state_failures == 0
    return {
        "success": success,
        "error": None if success else "partial_delivery",
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
    """Remind unanswered players while keeping one-tap RSVP available."""
    recipients_result = await get_evening_reminder_recipients(evening_id)
    if not recipients_result.get("success"):
        return {
            "success": False,
            "error": recipients_result.get("error") or "recipients_unavailable",
        }

    payload = recipients_result.get("data") or {}
    evening = payload.get("evening") or {}
    recipients = payload.get("recipients") or []
    response_keyboard = _response_keyboard(evening_id)
    reminder_text = private_event_text(evening, reminder=True)

    sent = 0
    failed = 0
    state_failures = 0
    failed_players = []

    for recipient in recipients:
        player_id = str(recipient.get("id") or "").strip()
        telegram_user_id = str(recipient.get("telegram_user_id") or "").strip()
        nickname = str(recipient.get("nickname") or "Игрок")
        original_message_id = int(recipient.get("first_message_id") or 0)
        if not player_id or not telegram_user_id:
            continue

        reminder_message_id = 0
        edit_error = None
        if original_message_id > 0:
            try:
                await bot.edit_message_text(
                    chat_id=int(telegram_user_id),
                    message_id=original_message_id,
                    text=reminder_text,
                    parse_mode="HTML",
                    reply_markup=response_keyboard,
                )
                reminder_message_id = original_message_id
            except Exception as exc:
                if "message is not modified" in str(exc).lower():
                    reminder_message_id = original_message_id
                else:
                    edit_error = exc

        if reminder_message_id <= 0:
            try:
                message = await bot.send_message(
                    int(telegram_user_id),
                    reminder_text,
                    parse_mode="HTML",
                    reply_markup=response_keyboard,
                )
                reminder_message_id = message.message_id
            except Exception as exc:
                failed += 1
                failed_players.append(nickname)
                combined_error = str(exc)
                if edit_error is not None:
                    combined_error = f"edit failed: {edit_error}; fallback failed: {exc}"
                persisted = await _retry_backend_write(lambda: save_evening_reminder_attempt(
                    evening_id,
                    player_id,
                    telegram_user_id,
                    success=False,
                    error=combined_error,
                ))
                if not persisted.get("success"):
                    state_failures += 1
                print(f"[CRM REMINDER] Delivery failed for {nickname} ({telegram_user_id}): {combined_error}")
                await asyncio.sleep(0.05)
                continue

        persisted = await _retry_backend_write(lambda: save_evening_reminder_attempt(
            evening_id,
            player_id,
            telegram_user_id,
            success=True,
            telegram_message_id=reminder_message_id,
        ))
        if persisted.get("success"):
            sent += 1
        else:
            state_failures += 1
            print(f"[CRM REMINDER] Failed to persist reminder delivery for {nickname}")
        await asyncio.sleep(0.05)

    success = failed == 0 and state_failures == 0
    return {
        "success": success,
        "error": None if success else "partial_delivery",
        "evening_id": evening_id,
        "eligible": len(recipients),
        "sent": sent,
        "failed": failed,
        "delivery_state_failures": state_failures,
        "failed_players": failed_players,
    }