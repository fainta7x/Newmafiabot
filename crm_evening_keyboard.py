from datetime import datetime

from aiogram.types import InlineKeyboardMarkup
from aiogram.utils.keyboard import InlineKeyboardBuilder


def crm_evening_response_kb(evening_id: str) -> InlineKeyboardMarkup:
    """Canonical CRM-evening response keyboard."""
    builder = InlineKeyboardBuilder()
    builder.button(text="✅ Иду", callback_data=f"evr:{evening_id}:going")
    builder.button(text="⏳ Приду позже", callback_data=f"evr:{evening_id}:late")
    builder.button(text="🤔 Пока думаю", callback_data=f"evr:{evening_id}:thinking")
    builder.button(text="❌ Не иду", callback_data=f"evr:{evening_id}:declined")
    builder.adjust(1)
    return builder.as_markup()


def crm_evening_select_kb(evenings: list[dict]) -> InlineKeyboardMarkup:
    """Select one exact open CRM evening before showing response buttons."""
    builder = InlineKeyboardBuilder()
    for evening in evenings:
        evening_id = str(evening.get("id") or "")
        if not evening_id:
            continue
        title = str(evening.get("title") or "Игровой вечер")
        starts_at = str(evening.get("starts_at") or "")
        try:
            dt = datetime.fromisoformat(starts_at.replace("Z", "+00:00"))
            starts_label = dt.strftime("%d.%m %H:%M")
        except (TypeError, ValueError):
            starts_label = starts_at or "время уточняется"
        label = f"📅 {starts_label} · {title}"
        if len(label) > 60:
            label = label[:57] + "..."
        builder.button(text=label, callback_data=f"evsel:{evening_id}")
    builder.adjust(1)
    return builder.as_markup()
