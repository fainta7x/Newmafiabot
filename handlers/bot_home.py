"""The bot's home card: one inline message whose sections open in place (no chat spam).

Sections: nearest evenings with answer buttons, the player's own sign-ups, frequent questions,
learning, our groups and a direct line to the organizer. Texts use «ты», like the rest of the bot.
"""
from __future__ import annotations

from datetime import datetime
from html import escape
from zoneinfo import ZoneInfo

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message, WebAppInfo

import bot_menu
from bot_api import get_open_evenings, get_player_home
from bot_telegram_api import get_telegram_destinations
from handlers.telegram_evening_copy import club_links, event_base_text, venue_map_url

router = Router()
MOSCOW = ZoneInfo("Europe/Moscow")
MAX_EVENINGS = 6

_FORMAT_SHORT = {
    "NOVICE": "🌱 для новичков",
    "CASUAL": "🎭 клубный",
    "STANDARD": "🎭 клубный",
    "RATING": "🏆 рейтинговый",
    "TOURNAMENT": "🏆 турнир",
}
_STATUS_TEXT = {"going": "✅ иду", "late": "⏳ приду позже", "thinking": "🤔 думаю"}
_MONTHS = ("января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря")
_WEEKDAYS = ("пн", "вт", "ср", "чт", "пт", "сб", "вс")

# Frequent questions: (key, button, answer). Answers follow docs/BUSINESS_RULES.md.
FAQ: tuple[tuple[str, str, str], ...] = (
    ("signup", "📝 Как записаться?",
     "Открой «📅 Ближайшие вечера», выбери вечер и нажми «✅ Буду».\n\n"
     "Если хочешь прийти не на весь вечер — нажми «🎯 Выбрать игры» и отметь только нужные. "
     "Передумал — нажми «❌ Не буду», чтобы место досталось другому."),
    ("price", "💳 Сколько стоит?",
     "• Клубный вечер — 100 ₽ за игру, но не больше 400 ₽ за вечер.\n"
     "• Вечер для новичков — первые два вечера бесплатно, дальше 200 ₽ за игру.\n"
     "• Рейтинговые вечера и турниры — отдельный взнос, он указан в анонсе.\n\n"
     "Сумму за твои игры приложение считает само."),
    ("place", "📍 Где и во сколько?",
     "Мы играем в «Суп с Котом», Пушкинский проезд, 4А.\n\n"
     "Клубные вечера — по пятницам, обычно с 20:00. На вечере для новичков за полчаса до первой игры "
     "рассказываем правила. Точное время каждого вечера — в его карточке."),
    ("novice", "🌱 Я новичок, что нужно?",
     "Ничего брать не нужно и опыт не нужен. Приходи к началу — судья расскажет правила и ответит на вопросы.\n\n"
     "Если хочется подготовиться, загляни в «📚 Обучение»: там правила, словарь и тренажёры."),
    ("friend", "👥 Можно прийти с другом?",
     "Конечно! Пусть друг тоже запишется через бота — так мы будем знать, сколько столов готовить."),
    ("pay", "💰 Как оплатить?",
     "Оплата — на вечере, организатору. На вечерах для новичков и рейтинговых — до начала игры.\n\n"
     "Сколько платить, видно в приложении в разделе «Оплата»."),
    ("tokens", "🪙 Что за жетоны и рейтинг?",
     "Жетоны — клубная валюта. За приход на вечер после записи дают 500 жетонов, за приход без записи или с опозданием — 400. "
     "Их можно тратить в магазине в приложении.\n\n"
     "Рейтинг Elo растёт за победы и показывает силу игрока. На вечерах для новичков он не меняется."),
    ("cancel", "🙅 Не могу прийти",
     "Нажми «❌ Не буду» в карточке вечера — место освободится для другого игрока. "
     "Если что-то срочное в день вечера — напиши организатору."),
)
_FAQ_BY_KEY = {key: (button, answer) for key, button, answer in FAQ}


def _back(target: str = "home", text: str = "⬅️ Назад") -> list[InlineKeyboardButton]:
    return [InlineKeyboardButton(text=text, callback_data=f"home:{target}")]


def _app_button(text: str, path: str) -> InlineKeyboardButton | None:
    url = bot_menu.player_app_url(path)
    return InlineKeyboardButton(text=text, web_app=WebAppInfo(url=url)) if url else None


def home_text(first_name: str | None = None) -> str:
    hello = f"Привет, <b>{escape(first_name)}</b>! " if first_name else ""
    return (
        "🎭 <b>2LA Noire · мафия в Туле</b>\n\n"
        f"{hello}Здесь можно записаться на вечер, узнать ответы на частые вопросы и найти наши группы.\n\n"
        "Выбери, что нужно 👇"
    )


def home_keyboard() -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = []
    app = _app_button(bot_menu.APP_BUTTON_TEXT, "/player")
    if app:
        rows.append([app])
    rows.append([
        InlineKeyboardButton(text="📅 Ближайшие вечера", callback_data="home:events"),
        InlineKeyboardButton(text="👤 Мои записи", callback_data="home:mine"),
    ])
    rows.append([
        InlineKeyboardButton(text="❓ Частые вопросы", callback_data="home:faq"),
        InlineKeyboardButton(text="📚 Обучение", callback_data="home:learn"),
    ])
    contact = club_links().get("organizer_telegram")
    row = [InlineKeyboardButton(text="👥 Наши группы", callback_data="home:groups")]
    if contact:
        row.append(InlineKeyboardButton(text="✉️ Написать организатору", url=contact))
    rows.append(row)
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _parse(value: object) -> datetime | None:
    try:
        return datetime.fromisoformat(str(value or "").replace("Z", "+00:00")).astimezone(MOSCOW)
    except (TypeError, ValueError):
        return None


def _when(value: object) -> str:
    start = _parse(value)
    if not start:
        return "время уточняется"
    return f"{_WEEKDAYS[start.weekday()]}, {start.day} {_MONTHS[start.month - 1]} · {start:%H:%M}"


def events_view(evenings: list[dict]) -> tuple[str, InlineKeyboardMarkup]:
    if not evenings:
        return (
            "📅 <b>Ближайшие вечера</b>\n\nСейчас открытых вечеров нет. Анонс придёт сюда, как только откроем запись.",
            InlineKeyboardMarkup(inline_keyboard=[_back()]),
        )
    lines = ["📅 <b>Ближайшие вечера</b>", ""]
    rows: list[list[InlineKeyboardButton]] = []
    for evening in evenings[:MAX_EVENINGS]:
        fmt = _FORMAT_SHORT.get(str(evening.get("format") or "").upper(), "🎭 вечер")
        coming = int(evening.get("attending_count") or 0)
        lines.append(f"<b>{_when(evening.get('starts_at'))}</b> — {fmt}\n   идут: {coming}")
        start = _parse(evening.get("starts_at"))
        label = f"{start.day} {_MONTHS[start.month - 1]} · {start:%H:%M}" if start else "Вечер"
        rows.append([InlineKeyboardButton(text=f"{label} · {fmt}", callback_data=f"home:ev:{evening.get('id')}")])
    lines.append("")
    lines.append("Нажми на вечер, чтобы записаться.")
    rows.append(_back())
    return "\n".join(lines), InlineKeyboardMarkup(inline_keyboard=rows)


def evening_view(evening: dict) -> tuple[str, InlineKeyboardMarkup]:
    evening_id = str(evening.get("id") or "")
    coming = int(evening.get("attending_count") or 0)
    thinking = int(evening.get("thinking_count") or 0)
    text = f"{event_base_text(evening)}\n\n👥 Идут: <b>{coming}</b>" + (f" · думают: {thinking}" if thinking else "")
    rows = [
        [InlineKeyboardButton(text="✅ Буду", callback_data=f"evr:{evening_id}:going"),
         InlineKeyboardButton(text="⏳ Приду позже", callback_data=f"evr:{evening_id}:late")],
        [InlineKeyboardButton(text="🤔 Пока думаю", callback_data=f"evr:{evening_id}:thinking"),
         InlineKeyboardButton(text="❌ Не буду", callback_data=f"evr:{evening_id}:declined")],
    ]
    games = _app_button("🎯 Выбрать игры", bot_menu.event_app_path(evening_id))
    if games:
        rows.append([games])
    map_url = venue_map_url(evening.get("venue"))
    if map_url:
        rows.append([InlineKeyboardButton(text="🗺 Как добраться", url=map_url)])
    rows.append(_back("events", "⬅️ К списку вечеров"))
    return text, InlineKeyboardMarkup(inline_keyboard=rows)


def mine_view(data: dict | None, error: str | None = None) -> tuple[str, InlineKeyboardMarkup]:
    rows: list[list[InlineKeyboardButton]] = []
    if error == "not_found":
        text = "👤 <b>Мои записи</b>\n\nПрофиль ещё не создан. Нажми /start и пройди короткую регистрацию — это минута."
    elif data is None:
        text = "👤 <b>Мои записи</b>\n\nНе получилось загрузить записи. Попробуй чуть позже."
    else:
        player = data.get("player") or {}
        evenings = data.get("evenings") or []
        lines = ["👤 <b>Мои записи</b>", "", f"Игрок: <b>{escape(str(player.get('nickname') or ''))}</b> · 🪙 {int(player.get('tokens') or 0)} жетонов", ""]
        if evenings:
            for evening in evenings:
                status = _STATUS_TEXT.get(str(evening.get("response_status")), "")
                games = int(evening.get("games") or 0)
                games_text = f" · игр: {games}" if games else ""
                lines.append(f"• <b>{_when(evening.get('starts_at'))}</b> — {status}{games_text}")
                rows.append([InlineKeyboardButton(text=f"✏️ {_when(evening.get('starts_at'))}", callback_data=f"home:ev:{evening.get('id')}")])
        else:
            lines.append("Пока ты никуда не записан. Загляни в «📅 Ближайшие вечера».")
        text = "\n".join(lines)
    profile = _app_button("👤 Открыть профиль", "/player")
    if profile:
        rows.append([profile])
    rows.append(_back())
    return text, InlineKeyboardMarkup(inline_keyboard=rows)


def faq_view() -> tuple[str, InlineKeyboardMarkup]:
    rows = [[InlineKeyboardButton(text=button, callback_data=f"home:faq:{key}")] for key, button, _ in FAQ]
    rows.append(_back())
    return "❓ <b>Частые вопросы</b>\n\nВыбери вопрос 👇", InlineKeyboardMarkup(inline_keyboard=rows)


def faq_answer_view(key: str) -> tuple[str, InlineKeyboardMarkup]:
    button, answer = _FAQ_BY_KEY.get(key, ("❓ Вопрос", "Ответ не найден."))
    rows = []
    contact = club_links().get("organizer_telegram")
    if contact:
        rows.append([InlineKeyboardButton(text="✉️ Остались вопросы? Написать", url=contact)])
    rows.append(_back("faq", "⬅️ К вопросам"))
    return f"<b>{escape(button)}</b>\n\n{escape(answer)}", InlineKeyboardMarkup(inline_keyboard=rows)


def learn_view() -> tuple[str, InlineKeyboardMarkup]:
    rows = []
    for text, path in (("🎓 Школа мафии", "/guide"), ("🧠 Тренажёры", "/guide?tab=trainers"), ("📖 Словарь и правила", "/guide?tab=reference")):
        button = _app_button(text, path)
        if button:
            rows.append([button])
    rows.append([InlineKeyboardButton(text=bot_menu.REGULATIONS_BUTTON_TEXT, callback_data="home:rules")])
    rows.append(_back())
    return (
        "📚 <b>Обучение</b>\n\nПравила, словарь мафиозных слов и тренажёры, чтобы потренироваться между вечерами.",
        InlineKeyboardMarkup(inline_keyboard=rows),
    )


def groups_view(destinations: list[dict]) -> tuple[str, InlineKeyboardMarkup]:
    by_id = {str(item.get("id")): item for item in destinations}
    rows = []
    for destination_id, text in (("public", "📣 Канал «Мафия в Туле 2LA Noire»"), ("novice", "🌱 Группа «Игры для новичков»")):
        url = str((by_id.get(destination_id) or {}).get("invite_url") or "").strip()
        if url.startswith("https://t.me/"):
            rows.append([InlineKeyboardButton(text=text, url=url)])
    vk = club_links().get("vk_group")
    if vk:
        rows.append([InlineKeyboardButton(text="💙 Группа VK", url=vk)])
    rows.append([InlineKeyboardButton(text="🎟 Доступ в основной клуб", callback_data="home:access")])
    rows.append(_back())
    return (
        "👥 <b>Наши группы</b>\n\n"
        "В канале — анонсы и новости клуба. Новички играют в группе «Игры для новичков», "
        "опытные игроки — в основном клубе (туда пускаем после знакомства).",
        InlineKeyboardMarkup(inline_keyboard=rows),
    )


async def _show(callback: CallbackQuery, text: str, markup: InlineKeyboardMarkup) -> None:
    try:
        await callback.message.edit_text(text, parse_mode="HTML", reply_markup=markup, disable_web_page_preview=True)
    except Exception as exc:  # «message is not modified» and old messages: send a fresh card
        if "not modified" not in str(exc).lower():
            await callback.message.answer(text, parse_mode="HTML", reply_markup=markup, disable_web_page_preview=True)
    await callback.answer()


async def _open_evenings() -> list[dict] | None:
    result = await get_open_evenings()
    data = result.get("data") if result.get("success") else None
    return data if isinstance(data, list) else None


async def send_home(message: Message) -> None:
    first_name = message.from_user.first_name if message.from_user else None
    await message.answer(home_text(first_name), parse_mode="HTML", reply_markup=home_keyboard())


@router.message(Command("menu"), F.chat.type == "private")
@router.message(F.text == bot_menu.MENU_BUTTON_TEXT, F.chat.type == "private")
async def open_home(message: Message) -> None:
    await send_home(message)


@router.message(Command("events"), F.chat.type == "private")
async def open_events(message: Message) -> None:
    evenings = await _open_evenings()
    if evenings is None:
        await message.answer("Не получилось загрузить вечера. Попробуй чуть позже.")
        return
    text, markup = events_view(evenings)
    await message.answer(text, parse_mode="HTML", reply_markup=markup)


@router.message(Command("faq"), F.chat.type == "private")
async def open_faq(message: Message) -> None:
    text, markup = faq_view()
    await message.answer(text, parse_mode="HTML", reply_markup=markup)


@router.callback_query(F.data.startswith("home:"))
async def home_callback(callback: CallbackQuery) -> None:
    parts = str(callback.data or "").split(":", 2)
    section = parts[1] if len(parts) > 1 else "home"
    arg = parts[2] if len(parts) > 2 else ""

    if section == "home":
        await _show(callback, home_text(callback.from_user.first_name), home_keyboard())
    elif section == "events":
        evenings = await _open_evenings()
        if evenings is None:
            await callback.answer("Не получилось загрузить вечера. Попробуй чуть позже.", show_alert=True)
            return
        await _show(callback, *events_view(evenings))
    elif section == "ev":
        evenings = await _open_evenings() or []
        evening = next((item for item in evenings if str(item.get("id")) == arg), None)
        if not evening:
            await callback.answer("Запись на этот вечер уже закрыта", show_alert=True)
            return
        await _show(callback, *evening_view(evening))
    elif section == "mine":
        result = await get_player_home(callback.from_user.id)
        await _show(callback, *mine_view(result.get("data") if result.get("success") else None, result.get("error")))
    elif section == "faq":
        await _show(callback, *(faq_answer_view(arg) if arg else faq_view()))
    elif section == "learn":
        await _show(callback, *learn_view())
    elif section == "rules":
        from handlers.start_profile import REGULATIONS_TEXT
        await callback.message.answer(REGULATIONS_TEXT, parse_mode=None)
        await callback.answer()
    elif section == "groups":
        result = await get_telegram_destinations()
        rows = ((result.get("data") or {}).get("destinations") or []) if result.get("success") else []
        await _show(callback, *groups_view(rows))
    elif section == "access":
        from handlers.registration import _handle_club_access, _main_menu
        await _handle_club_access(callback.message, await _main_menu(callback.from_user.id), callback.from_user)
        await callback.answer()
    else:
        await callback.answer()
