from html import escape
from urllib.parse import quote

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, KeyboardButton, WebAppInfo
from aiogram.utils.keyboard import ReplyKeyboardBuilder

import config

APP_BUTTON_TEXT = "🎭 Открыть 2LA Noire"
CABINET_BUTTON_TEXT = "Личный кабинет"
CLUB_ACCESS_BUTTON_TEXT = "🎟 Доступ в клуб"
REGULATIONS_BUTTON_TEXT = "📋 РЕГЛАМЕНТ"
STATUS_BUTTON_TEXT = "🩺 Проверить состояние приложения"


def player_app_url(path: str = "/player") -> str | None:
    base = str(config.PLAYER_APP_URL or "").strip().rstrip("/")
    if not base:
        return None
    suffix = "/" + str(path or "/player").lstrip("/")
    if base.endswith("/player") and suffix.startswith("/player"):
        base = base[:-len("/player")]
    return f"{base}{suffix}"


def cabinet_app_url() -> str | None:
    base = str(config.PLAYER_APP_URL or "").strip().rstrip("/")
    return base or None


def event_app_path(evening_id: str) -> str:
    safe_id = quote(str(evening_id or "").strip(), safe="")
    return f"/player/events?event={safe_id}"


def main_menu_for_user(*, is_admin: bool, is_judge: bool):
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
        builder.row(KeyboardButton(text=STATUS_BUTTON_TEXT))
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


def cabinet_inline_keyboard(text: str = CABINET_BUTTON_TEXT) -> InlineKeyboardMarkup | None:
    url = cabinet_app_url()
    if not url:
        return None
    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text=text, web_app=WebAppInfo(url=url))]]
    )


def event_inline_keyboard(evening_id: str, text: str = "🎯 Выбрать / изменить игры") -> InlineKeyboardMarkup | None:
    return app_inline_keyboard(event_app_path(evening_id), text)


def start_text(first_name: str | None = None, *, is_organizer: bool = False) -> str:
    greeting = f"Привет, <b>{escape(first_name)}</b>.\n\n" if first_name else ""
    commands = "/cabinet — личный кабинет\n" + ("/crm — CRM организатора\n" if is_organizer else "")
    return (
        "🎭 <b>2LA Noire</b>\n\n"
        f"{greeting}"
        "Сюда приходят анонсы вечеров, напоминания и результаты игр. На анонс можно ответить прямо кнопками: "
        "«Буду», «Приду позже», «Пока думаю», «Не буду».\n\n"
        "В приложении — запись на конкретные игры, профиль, рейтинг, история, кошелёк и ставки.\n\n"
        f"Команды:\n{commands}\n"
        "Открой клуб кнопкой ниже."
    )
