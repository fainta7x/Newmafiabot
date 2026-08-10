from aiogram import Bot

import config
from bot_announcement_api import get_evening_announcement_state, save_evening_announcement_state
from handlers.crm_booking import build_crm_evening_stats_text


async def refresh_crm_group_stats(bot: Bot, evening_id: str) -> bool:
    """Refresh the one public Telegram participant list for this exact CRM evening."""
    state_result = await get_evening_announcement_state(evening_id)
    if not state_result.get("success"):
        return False

    payload = state_result.get("data") or {}
    state = payload.get("state") or {}
    chat_id_raw = state.get("group_chat_id")
    stats_message_id = state.get("group_stats_message_id")

    # No group announcement exists for this evening yet. Do not create one implicitly.
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
        print(f"[CRM STATS] Failed to edit group list for {evening_id}: {exc}")

    try:
        new_message = await bot.send_message(
            chat_id,
            text,
            parse_mode="HTML",
            message_thread_id=config.ANNOUNCE_TOPIC_ID,
        )
        saved = await save_evening_announcement_state(
            evening_id,
            group_chat_id=str(chat_id),
            group_stats_message_id=new_message.message_id,
        )
        return bool(saved.get("success"))
    except Exception as exc:
        print(f"[CRM STATS] Failed to recreate group list for {evening_id}: {exc}")
        return False
