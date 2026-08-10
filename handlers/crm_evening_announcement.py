from aiogram import Bot

from bot_announcement_api import (
    get_evening_announcement_recipients,
    save_evening_announcement_delivery,
    save_evening_announcement_state,
)
from crm_evening_keyboard import crm_evening_response_kb
from handlers.crm_booking import _evening_prompt
from handlers.crm_group_announcement import send_crm_group_announcement


async def send_crm_evening_announcement(bot: Bot, evening_id: str) -> dict:
    """Send the canonical group announcement and filtered private CRM invitations."""
    group_result = await send_crm_group_announcement(bot, evening_id)
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
    delivery_state_failures = 0
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
            print(f"[CRM ANNOUNCE] Private delivery failed for {nickname} ({telegram_user_id}): {exc}")
            continue

        delivery = await save_evening_announcement_delivery(
            evening_id=evening_id,
            player_id=player_id,
            telegram_user_id=telegram_user_id,
            telegram_message_id=message.message_id,
        )
        if not delivery.get("success"):
            delivery_state_failures += 1
            print(f"[CRM ANNOUNCE] Failed to persist private delivery for {nickname}")
        else:
            sent += 1

    if failed == 0 and delivery_state_failures == 0:
        await save_evening_announcement_state(evening_id, dm_sent_at=__import__('datetime').datetime.now().astimezone().isoformat())

    return {
        "success": True,
        "evening_id": evening_id,
        "group": group_result,
        "dm": {
            "eligible_remaining_before_send": len(recipients),
            "sent": sent,
            "failed": failed,
            "delivery_state_failures": delivery_state_failures,
            "failed_players": failed_players,
        },
    }
