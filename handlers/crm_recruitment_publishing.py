from aiogram import Bot
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from bot_announcement_api import get_evening_recruitment_state
from bot_telegram_api import get_evening_telegram_plan
from handlers.telegram_evening_copy import recruitment_group_text


async def _event_keyboard(bot: Bot, evening_id: str) -> InlineKeyboardMarkup | None:
    try:
        me = await bot.get_me()
        if not me.username:
            return None
        return InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(
                text="Записаться на вечер",
                url=f"https://t.me/{me.username}?start=event_{evening_id}",
            )
        ]])
    except Exception:
        return None


async def send_crm_evening_recruitment(bot: Bot, evening_id: str) -> dict:
    state_result = await get_evening_recruitment_state(evening_id)
    if not state_result.get("success"):
        return {"success": False, "error": state_result.get("error") or "recruitment_state_unavailable"}
    state = state_result.get("data") or {}
    needed = int(state.get("needed_players") or 0)
    if needed <= 0:
        return {"success": False, "error": "already_full", "needed_players": 0}
    if not state.get("can_recruit"):
        return {"success": False, "error": "closed"}

    plan_result = await get_evening_telegram_plan(evening_id)
    if not plan_result.get("success"):
        return {"success": False, "error": plan_result.get("error") or "plan_unavailable"}
    plan = plan_result.get("data") or {}
    evening = state.get("evening") or plan.get("evening") or {}
    destinations = {str(item.get("id")): item for item in (plan.get("destinations") or [])}
    desired = {str(item) for item in (plan.get("desired_destination_ids") or [])}
    desired.discard("public")
    text = recruitment_group_text(evening, needed)
    keyboard = await _event_keyboard(bot, evening_id)

    results = []
    for destination_id in sorted(desired):
        destination = destinations.get(destination_id) or {}
        if not destination.get("active") or not str(destination.get("chat_id") or "").strip():
            results.append({"destination_id": destination_id, "success": True, "action": "skipped"})
            continue
        kwargs = {
            "chat_id": str(destination.get("chat_id")).strip(),
            "text": text,
            "parse_mode": "HTML",
            "reply_markup": keyboard,
            "disable_web_page_preview": True,
        }
        topic_id = destination.get("topic_id")
        if topic_id:
            kwargs["message_thread_id"] = int(topic_id)
        try:
            message = await bot.send_message(**kwargs)
            results.append({"destination_id": destination_id, "success": True, "action": "sent", "message_id": message.message_id})
        except Exception as exc:
            results.append({"destination_id": destination_id, "success": False, "action": "failed", "error": str(exc)})

    failures = [item for item in results if not item.get("success")]
    sent = [item for item in results if item.get("action") == "sent" and item.get("success")]
    return {
        "success": not failures and bool(sent),
        "error": None if not failures and sent else "partial_delivery" if sent else "destination_unavailable",
        "evening_id": evening_id,
        "needed_players": needed,
        "sent": len(sent),
        "results": results,
    }
