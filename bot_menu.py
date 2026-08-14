from html import escape
from urllib.parse import quote

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, KeyboardButton, WebAppInfo
from aiogram.utils.keyboard import ReplyKeyboardBuilder

import config

APP_BUTTON_TEXT = "🎭 Открыть 2LA Noire"
CLUB_ACCESS_BUTTON_TEXT = "🎟 Доступ в клуб"
REGULATIONS_BUTTON_TEXT = "📋 РЕГЛАМЕНТ"


def player_app_url(path: str = "/player") -> str | None:
    base = str(config.PLAYER_APP_URL or "").strip().rstrip("/")
    if not base:
        return None
    suffix = "/" + str(path or "/player").lstrip("/")

    # PLAYER_APP_URL may be configured either as the site origin or as /player itself.
    if base.endswith("/player") and suffix.startswith("/player"):
        base = base[:-len("/player")]
    return f"{base}{suffix}"


def event_app_path(evening_id: str) -> str:
    safe_id = quote(str(evening_id or "").strip(), safe="")
    return f"/player/events?event={safe_id}"


def main_menu_for_user(*, is_admin: bool, is_judge: bool):
    """Compact bot shell: the Mini App owns player-facing product navigation."""
    builder = ReplyKeyboardBuilder()
    app_url = player_app_url()
    if app_url:
        builder.row(KeyboardButton(text=APP_BUTTON_TEXT, web_app=WebAppInfo(url=app_url)))
    else:
        builder.row(KeyboardButton(text=APP_BUTTON_TEXT))

    builder.row(
        KeyboardButton(text=CLUB_ACCESS_BUTTON_TEXT),
        KeyboardButton(text=REGULATIONS_BUTTON_TEXT),
    )

    if is_admin:
        builder.row(KeyboardButton(text="🛠 Админ-панель"))
    elif is_judge:
        builder.row(KeyboardButton(text="⚖ Панель судьи"))

    return builder.as_markup(
        resize_keyboard=True,
        is_persistent=True,
        input_field_placeholder="2LA Noire",
    )


def app_inline_keyboard(path: str = "/player", text: str = APP_BUTTON_TEXT) -> InlineKeyboardMarkup | None:
    url = player_app_url(path)
    if not url:
        return None
    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text=text, web_app=WebAppInfo(url=url))]]
    )


def event_inline_keyboard(evening_id: str, text: str = "🎯 Выбрать игры") -> InlineKeyboardMarkup | None:
    return app_inline_keyboard(event_app_path(evening_id), text)


def start_text(first_name: str | None = None) -> str:
    greeting = f"Привет, <b>{escape(first_name)}</b>.\n\n" if first_name else ""
    return (
        "🎭 <b>2LA Noire</b>\n\n"
        f"{greeting}"
        "Бот теперь работает как спутник клуба: сюда приходят анонсы, напоминания, результаты и важные сообщения.\n\n"
        "В приложении собраны запись на конкретные игры, профиль, рейтинг, история, кошелёк, магазин и ставки.\n\n"
        "Открывай клуб кнопкой ниже — бот и приложение используют одну логику и одну клубную базу."
    )
