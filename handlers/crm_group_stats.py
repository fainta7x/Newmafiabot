from aiogram import Bot

from bot_announcement_api import get_evening_announcement_state
from handlers.crm_booking import build_crm_evening_stats_text
from handlers.crm_telegram_publishing import sync_evening_telegram


async def refresh_crm_group_stats(bot: Bot, evening_id: str) -> bool:
    """Refresh already-created Telegram event messages after an RSVP.

    New routed publications are edit-only here: a player response must never create
    a fresh announcement. The legacy single stats message is still refreshed as a
    fallback while old evenings remain in circulation.
    """
    routed_updated = False
    try:
        result = await sync_evening_telegram(
            bot,
            evening_id,
            refresh_router=False,
            allow_create=False,
        )
        routed_updated = bool(result.get("success"))
    except Exception as exc:
        print(f"[CRM STATS] Routed publication refresh failed for {evening_id}: {exc}")

    state_result = await get_evening_announcement_state(evening_id)
    if not state_result.get("success"):
        return routed_updated

    payload = state_result.get("data") or {}
    state = payload.get("state") or {}
    chat_id_raw = state.get("group_chat_id")
    stats_message_id = state.get("group_stats_message_id")

    # No legacy group announcement exists for this evening. Never create one implicitly.
    if not chat_id_raw or not stats_message_id:
        return routed_updated

    text = await build_crm_evening_stats_text(evening_id)
    if not text:
        return routed_updated

    try:
        chat_id = int(chat_id_raw)
        message_id = int(stats_message_id)
    except (TypeError, ValueError):
        return routed_updated

    try:
        await bot.edit_message_text(
            chat_id=chat_id,
            message_id=message_id,
            text=text,
            parse_mode="HTML",
        )
        return True
    except Exception as exc:
        print(f"[CRM STATS] Failed to edit legacy group list for {evening_id}: {exc}")
        return routed_updated
