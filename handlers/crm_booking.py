from datetime import datetime
from html import escape
from zoneinfo import ZoneInfo

from aiogram import F, Router
from aiogram.types import CallbackQuery

import bot_menu
from bot_api import get_evening_participants, get_open_evenings
from handlers.telegram_evening_copy import private_event_text

router = Router()

_RESPONSE_LABELS = {
    "going": "Иду",
    "late": "Приду позже",
    "thinking": "Пока думаю",
    "declined": "Не иду",
}

_LEGACY_BOOK_TO_RESPONSE = {
    "book_ontime": "going",
    "book_late": "late",
    "book_thinking": "thinking",
    "book_no": "declined",
}


def _format_start(value: object) -> str:
    raw = str(value or "")
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if parsed.tzinfo is not None:
            parsed = parsed.astimezone(ZoneInfo("Europe/Moscow"))
        return parsed.strftime("%d.%m.%Y в %H:%M")
    except (TypeError, ValueError):
        return raw or "Время уточняется"


def _evening_prompt(evening: dict) -> str:
    return private_event_text(evening)


def _numbered_stats_block(title: str, players: list[str], start: int = 1) -> tuple[str | None, int]:
    if not players:
        return None, start
    lines = [title]
    for offset, name in enumerate(players):
        lines.append(f"{start + offset}. {name}")
    return "\n".join(lines), start + len(players)


async def build_crm_evening_stats_text(evening_id: str) -> str | None:
    """Build the legacy participant list from canonical CRM state only."""
    result = await get_evening_participants(evening_id)
    if not result.get("success"):
        return None

    payload = result.get("data") or {}
    evening = payload.get("evening") or {}
    participants = payload.get("participants") or []

    grouped = {status: [] for status in _RESPONSE_LABELS}
    for participant in participants:
        status = str(participant.get("response_status") or "")
        if status not in grouped:
            continue
        grouped[status].append(escape(str(participant.get("nickname") or "Игрок без профиля")))

    # Owner, 2026-10-23: «Думаю» is not «Идут»; the two numbers are shown apart.
    going_total = len(grouped["going"]) + len(grouped["late"])
    thinking_total = len(grouped["thinking"])
    title = escape(str(evening.get("title") or "Игровой вечер"))
    starts = _format_start(evening.get("starts_at"))

    sections = [f"📊 <b>{title}</b>\n🕗 {starts}\nИдут: <b>{going_total}</b> · думают: <b>{thinking_total}</b>"]
    next_number = 1
    for status, label in (
        ("going", "✅ Идут"),
        ("late", "⏳ Придут позже"),
        ("thinking", "🤔 Пока думают"),
    ):
        block, next_number = _numbered_stats_block(label, grouped[status], next_number)
        if block:
            sections.append(block)

    declined_block, _ = _numbered_stats_block("❌ Не идут", grouped["declined"], 1)
    if declined_block:
        sections.append(declined_block)

    return "\n\n".join(sections)


async def _load_open_evenings() -> list[dict] | None:
    result = await get_open_evenings()
    if not result.get("success"):
        return None
    data = result.get("data")
    return data if isinstance(data, list) else None




@router.callback_query(F.data.startswith("evsel:"))
async def select_crm_evening(callback: CallbackQuery):
    evening_id = str(callback.data or "").split(":", 1)[1]
    evenings = await _load_open_evenings()
    if evenings is None:
        await callback.answer("Не удалось загрузить вечера", show_alert=True)
        return

    evening = next((item for item in evenings if str(item.get("id")) == evening_id), None)
    if not evening:
        await callback.answer("Этот вечер уже закрыт для записи", show_alert=True)
        return

    await callback.message.edit_text(
        _evening_prompt(evening),
        parse_mode="HTML",
        reply_markup=bot_menu.event_inline_keyboard(evening_id),
    )
    await callback.answer()




