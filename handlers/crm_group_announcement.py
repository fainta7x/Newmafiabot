from aiogram import Bot

import config
from bot_announcement_api import get_evening_announcement_state, save_evening_announcement_state
from bot_api import get_evening_participants
from crm_evening_keyboard import crm_evening_response_kb
from handlers.crm_booking import _evening_prompt, build_crm_evening_stats_text


async def send_crm_group_announcement(bot: Bot, evening_id: str) -> dict:
    """Send or resume the one canonical public Telegram announcement for a CRM evening."""
    evening_result = await get_evening_participants(evening_id)
    if not evening_result.get("success"):
        return {"success": False, "error": evening_result.get("error") or "evening_unavailable"}

    payload = evening_result.get("data") or {}
    evening = payload.get("evening") or {}
    if str(evening.get("status") or "") not in {"published", "active"} or evening.get("settled_at"):
        return {"success": False, "error": "closed"}

    state_result = await get_evening_announcement_state(evening_id)
    if not state_result.get("success"):
        return {"success": False, "error": state_result.get("error") or "state_unavailable"}
    state = (state_result.get("data") or {}).get("state") or {}

    chat_id = int(config.GROUP_ID)
    announcement_message_id = state.get("group_announcement_message_id")
    stats_message_id = state.get("group_stats_message_id")

    if not announcement_message_id:
        try:
            announcement = await bot.send_message(
                chat_id,
                _evening_prompt(evening),
                parse_mode="HTML",
                reply_markup=crm_evening_response_kb(evening_id),
                message_thread_id=config.ANNOUNCE_TOPIC_ID,
            )
        except Exception as exc:
            print(f"[CRM ANNOUNCE] Failed to send group announcement for {evening_id}: {exc}")
            return {"success": False, "error": "telegram_group_send"}

        saved = await save_evening_announcement_state(
            evening_id,
            group_chat_id=str(chat_id),
            group_announcement_message_id=announcement.message_id,
            group_sent_at=announcement.date.isoformat(),
        )
        if not saved.get("success"):
            return {
                "success": False,
                "error": "state_save_after_group_send",
                "group_announcement_message_id": announcement.message_id,
            }
        announcement_message_id = announcement.message_id

    if not stats_message_id:
        stats_text = await build_crm_evening_stats_text(evening_id)
        if not stats_text:
            return {
                "success": False,
                "error": "stats_unavailable",
                "group_announcement_message_id": announcement_message_id,
            }
        try:
            stats_message = await bot.send_message(
                chat_id,
                stats_text,
                parse_mode="HTML",
                message_thread_id=config.ANNOUNCE_TOPIC_ID,
            )
        except Exception as exc:
            print(f"[CRM ANNOUNCE] Failed to send group stats for {evening_id}: {exc}")
            return {
                "success": False,
                "error": "telegram_stats_send",
                "group_announcement_message_id": announcement_message_id,
            }

        saved = await save_evening_announcement_state(
            evening_id,
            group_chat_id=str(chat_id),
            group_stats_message_id=stats_message.message_id,
        )
        if not saved.get("success"):
            return {
                "success": False,
                "error": "state_save_after_stats_send",
                "group_announcement_message_id": announcement_message_id,
                "group_stats_message_id": stats_message.message_id,
            }
        stats_message_id = stats_message.message_id

    return {
        "success": True,
        "evening_id": evening_id,
        "group_chat_id": chat_id,
        "group_announcement_message_id": int(announcement_message_id),
        "group_stats_message_id": int(stats_message_id),
        "already_sent": bool(state.get("group_announcement_message_id") and state.get("group_stats_message_id")),
    }
