from urllib.parse import quote

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, KeyboardButton, WebAppInfo
from aiogram.utils.keyboard import ReplyKeyboardBuilder

import config

APP_BUTTON_TEXT = "🎭 Открыть 2LA Noire"
CABINET_BUTTON_TEXT = "Личный кабинет"
CLUB_ACCESS_BUTTON_TEXT = "🎟 Доступ в клуб"
REGULATIONS_BUTTON_TEXT = "📋 РЕГЛАМЕНТ"
STATUS_BUTTON_TEXT = "🩺 Проверить состояние приложения"
JUDGE_BUTTON_TEXT = "⚖ Судейство"
MENU_BUTTON_TEXT = "📋 Меню"


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


def main_menu_for_user(*, is_admin: bool = False, is_judge: bool = False):
    """One short row for everyone: the app and the menu card. Access, organizer and judge entries live inside the card
    (owner, 2026-10-13: the big keyboard covered the card and repeated the same entry three times)."""
    builder = ReplyKeyboardBuilder()
    app_url = player_app_url()
    builder.row(
        KeyboardButton(text=APP_BUTTON_TEXT, web_app=WebAppInfo(url=app_url)) if app_url else KeyboardButton(text=APP_BUTTON_TEXT),
        KeyboardButton(text=MENU_BUTTON_TEXT),
    )
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


BROWSER_BUTTON_TEXT = "🌐 Открыть в браузере"
BROWSER_CRM_BUTTON_TEXT = "🛠 Кабинет организатора (браузер)"


def direct_app_url() -> str | None:
    """The app's site root. In a plain browser the root opens the organizer sign-in (password), not the player cabinet."""
    base = cabinet_app_url()
    if not base:
        return None
    return base[:-len("/player")] if base.endswith("/player") else base


def browser_player_url() -> str | None:
    """Player cabinet by its plain address. Telegram sign-in works only inside the Mini App; a browser signs in with VK."""
    root = direct_app_url()
    return f"{root}/player" if root else None


def browser_button() -> InlineKeyboardButton | None:
    url = browser_player_url()
    return InlineKeyboardButton(text=BROWSER_BUTTON_TEXT, url=url) if url else None


def browser_crm_button() -> InlineKeyboardButton | None:
    url = direct_app_url()
    return InlineKeyboardButton(text=BROWSER_CRM_BUTTON_TEXT, url=url) if url else None


def browser_inline_keyboard(*, is_admin: bool = False) -> InlineKeyboardMarkup | None:
    rows = [[button] for button in (browser_button(), browser_crm_button() if is_admin else None) if button]
    return InlineKeyboardMarkup(inline_keyboard=rows) if rows else None


def event_inline_keyboard(evening_id: str, text: str = "🎯 Выбрать / изменить игры") -> InlineKeyboardMarkup | None:
    return app_inline_keyboard(event_app_path(evening_id), text)


def start_text(first_name: str | None = None, *, is_organizer: bool = False) -> str:
    return "Анонсы вечеров и результаты игр придут сюда — отвечай кнопками под сообщениями. Всё остальное — в меню 👇"
