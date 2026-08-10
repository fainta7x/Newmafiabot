from aiogram.types import InlineKeyboardMarkup
from aiogram.utils.keyboard import InlineKeyboardBuilder


def crm_evening_response_kb(evening_id: str) -> InlineKeyboardMarkup:
    """Canonical CRM-evening response keyboard, separate from legacy book_* callbacks."""
    builder = InlineKeyboardBuilder()
    builder.button(text="✅ Иду", callback_data=f"evr:{evening_id}:going")
    builder.button(text="⏳ Приду позже", callback_data=f"evr:{evening_id}:late")
    builder.button(text="🤔 Пока думаю", callback_data=f"evr:{evening_id}:thinking")
    builder.button(text="❌ Не иду", callback_data=f"evr:{evening_id}:declined")
    builder.adjust(1)
    return builder.as_markup()
