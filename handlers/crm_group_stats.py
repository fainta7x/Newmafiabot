from aiogram import Bot

from bot_announcement_api import get_evening_announcement_state
from handlers.crm_booking import build_crm_evening_stats_text


async def refresh_crm_group_stats(bot: Bot, evening_id: str) -> bool:
    """Refresh the one public Telegram participant list for this exact CRM evening.

    This function is deliberately edit-only: a response must never create a new
    group message. If the canonical stats message cannot be edited, we log the
    error and leave the group untouched.
    """
    state_result = await get_evening_announcement_state(evening_id)
    if not state_result.get("success"):
        return False

    payload = state_result.get("data") or {}
    state = payload.get("state") or {}
    chat_id_raw = state.get("group_chat_id")
    stats_message_id = state.get("group_stats_message_id")

    # No group announcement exists for this evening yet. Never create one implicitly.
    if not chat_id_raw or not stats_message_id:
        return False

    text = await build_crm_evening_stats_text(evening_id)
    if not text:
        return False

    try:
        chat_id = int(chat_id_raw)
        message_id = int(stats_message_id)
    except (TypeError, ValueError):
        return False

    try:
        await bot.edit_message_text(
            chat_id=chat_id,
            message_id=message_id,
            text=text,
            parse_mode="HTML",
        )
        return True
    except Exception as exc:
        # Most importantly: do not send a replacement message here. Player
        # responses should be silent in the group apart from editing the one
        # canonical participant list.
        print(f"[CRM STATS] Failed to edit group list for {evening_id}: {exc}")
        return False
