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

# Frequent questions: (key, button, answer). Friendly, for newcomers; facts follow docs/BUSINESS_RULES.md.
FAQ: tuple[tuple[str, str, str], ...] = (
    ("signup", "📝 Как записаться",
     "Проще простого 🙂 Открой в меню список вечеров, выбери подходящий вечер и нажми «✅ Буду» — ты записан на все игры вечера!\n\n"
     "Сможешь только на часть вечера? Нажми «🎯 Выбрать игры» и отметь нужные. "
     "А если планы поменяются, просто нажми «❌ Не буду» — так место достанется кому-то ещё."),
    ("price", "💳 Сколько стоит",
     "На клубном вечере одна игра стоит 100 ₽, но за весь вечер ты заплатишь не больше 400 ₽ — сколько бы ни сыграл.\n\n"
     "Если ты новичок, первые два вечера для тебя бесплатные 🎁 Дальше — 200 ₽ за игру.\n\n"
     "Считать самому ничего не нужно: приложение всё посчитает за тебя."),
    ("place", "📍 Где и когда",
     "Мы собираемся в «Суп с Котом» — Пушкинский проезд, 4А.\n\n"
     "Клубные вечера начинаются в 21:00. Вечер для новичков — раньше: в 18:30 спокойно рассказываем правила, "
     "а с 19:00 уже играем.\n\n"
     "Точное время всегда есть в карточке вечера в меню."),
    ("novice", "🌱 Я новичок",
     "Только ты сам, хорошее настроение и никнейм 🙂 Придумай заранее, как тебя будут звать за столом — "
     "так к тебе будут обращаться всю игру.\n\n"
     "Опыт не нужен — мы всё объясним с нуля, а за столом будут такие же новички, как ты.\n\n"
     "Хочешь подготовиться? Загляни в правила ниже и посмотри, как играют сильные игроки на канале «Мафия с Левшой»."),
    ("friend", "👥 С другом",
     "Конечно, с другом даже веселее! Попроси его тоже записаться через бота — "
     "так мы будем знать, сколько столов подготовить."),
    ("pay", "💰 Как оплатить",
     "Оплатить можно прямо на вечере — организатору. На вечере для новичков, когда бесплатные вечера "
     "уже закончились, оплату нужно передать до первой игры — без неё игру не начнём.\n\n"
     "Сколько с тебя, всегда видно в приложении, в разделе «Оплата»."),
    ("tokens", "🪙 Жетоны",
     "Жетоны — это наша клубная валюта, и копятся они сами 🪙 Приходишь на вечер — получаешь жетоны. "
     "А если записался заранее и пришёл вовремя, их будет больше.\n\n"
     "Потратить их можно в магазине в приложении."),
    ("cancel", "🙅 Не могу прийти",
     "Ничего страшного, бывает! Нажми «❌ Не буду» в карточке вечера — место освободится для кого-то другого.\n\n"
     "Если планы поменялись в последний момент, лучше напиши организатору, чтобы мы тебя не ждали."),
)
GAME_EXAMPLE_URL = "https://www.youtube.com/@lebwamafia"  # «Мафия с Левшой»: how classic mafia is played

_FAQ_BY_KEY = {key: (button, answer) for key, button, answer in FAQ}
# The full question heads the answer; the buttons stay short so they fit two per row.
_FAQ_TITLES = {
    "signup": "📝 Как записаться?", "price": "💳 Сколько стоит?", "place": "📍 Где и во сколько?",
    "novice": "🌱 Я новичок, что нужно?", "friend": "👥 Можно прийти с другом?", "pay": "💰 Как оплатить?",
    "tokens": "🪙 Что такое жетоны?", "cancel": "🙅 Не могу прийти",
}


def _back(target: str = "home", text: str = "⬅️ Назад") -> list[InlineKeyboardButton]:
    return [InlineKeyboardButton(text=text, callback_data=f"home:{target}")]


def _pairs(buttons: list[InlineKeyboardButton | None]) -> list[list[InlineKeyboardButton]]:
    """Two buttons per row: a short menu instead of a wall of full-width buttons."""
    present = [button for button in buttons if button]
    return [present[index:index + 2] for index in range(0, len(present), 2)]


def _app_button(text: str, path: str) -> InlineKeyboardButton | None:
    url = bot_menu.player_app_url(path)
    return InlineKeyboardButton(text=text, web_app=WebAppInfo(url=url)) if url else None


CLUB_LEVELS = {"club", "tournament", "rating"}


def audience_for(home: dict | None) -> str:
    """«club» for players the organizer admitted to the club; everyone else (and no profile yet) is a newcomer."""
    level = str(((home or {}).get("player") or {}).get("game_level") or "").lower()
    return "club" if level in CLUB_LEVELS else "newcomer"


def _is_novice_evening(evening: dict) -> bool:
    return str(evening.get("format") or "").upper() == "NOVICE"


def newcomer_home(first_name: str | None, evenings: list[dict]) -> tuple[str, InlineKeyboardMarkup]:
    hello = f"Привет, <b>{escape(first_name)}</b>! 👋\n\n" if first_name else "Привет! 👋\n\n"
    novice = next((item for item in evenings if _is_novice_evening(item)), None)
    nearest = (
        f"🌱 Ближайший вечер для новичков: <b>{_when(novice.get('starts_at'))}</b>\n"
        "Правила рассказываем за полчаса до первой игры.\n\n"
        if novice else ""
    )
    text = (
        f"{hello}"
        "Это <b>2LA Noire</b> — клуб классической мафии в Туле 🎭\n\n"
        "Мафия — игра, где за столом прячутся несколько «злодеев», а остальные пытаются их вычислить по словам, "
        "голосам и поступкам. Опыт не нужен: на вечере для новичков всё объясним с нуля.\n\n"
        f"{nearest}"
        "Выбирай, что интересно 👇"
    )
    rows = [
        [InlineKeyboardButton(text="📅 Записаться на вечер", callback_data="home:events")],
        [InlineKeyboardButton(text="🎭 Что за игра?", callback_data="home:game"),
         InlineKeyboardButton(text="❓ Вопросы", callback_data="home:faq")],
        [InlineKeyboardButton(text="📚 Правила и тренажёры", callback_data="home:learn")],
    ]
    return text, InlineKeyboardMarkup(inline_keyboard=rows)


def club_home(first_name: str | None, home: dict | None, evenings: list[dict]) -> tuple[str, InlineKeyboardMarkup]:
    player = (home or {}).get("player") or {}
    name = escape(str(player.get("nickname") or first_name or ""))
    mine = {str(item.get("id")): item for item in (home or {}).get("evenings") or []}
    lines = [f"🎭 <b>2LA Noire · клуб</b>", "", f"Привет, <b>{name}</b>!" if name else "Привет!"]
    upcoming = [item for item in evenings if not _is_novice_evening(item)][:1] or evenings[:1]
    action_evening = None
    action_label = None
    for evening in upcoming:
        own = mine.get(str(evening.get("id")))
        answer = str((own or {}).get("response_status") or "unanswered")
        status = _STATUS_TEXT.get(answer, "ты ещё не ответил")
        games = int((own or {}).get("games") or 0)
        first_game = (own or {}).get("first_game")
        if answer == "late":
            status += f" · с игры №{first_game}" if first_game else " · уточни стартовую игру"
        elif games and answer == "going":
            status += f" · {games} игр"
        lines += ["", f"📅 Ближайший вечер: <b>{_when(evening.get('starts_at'))}</b>",
                  f"👥 Идут: {int(evening.get('attending_count') or 0)} · ты: {status}"]
        action_evening = str(evening.get("id") or "")
        action_label = {
            "going": "✏️ Изменить запись",
            "late": "⏳ Изменить время прибытия",
            "thinking": "🤔 Определиться с вечером",
            "declined": "🔄 Пересмотреть ответ",
        }.get(answer, "✅ Ответить на приглашение")
        break
    text = "\n".join(lines)
    rows: list[list[InlineKeyboardButton]] = []
    app = _app_button(bot_menu.APP_BUTTON_TEXT, "/player")
    if app:
        rows.append([app])
    if action_evening and action_label:
        rows.append([InlineKeyboardButton(text=action_label, callback_data=f"home:ev:{action_evening}")])
    rows.append([
        InlineKeyboardButton(text="📅 Расписание", callback_data="home:events"),
        InlineKeyboardButton(text="👤 Мои записи", callback_data="home:mine"),
    ])
    rows.append([
        InlineKeyboardButton(text="👥 Составы", callback_data="home:lineups"),
        InlineKeyboardButton(text="☰ Ещё", callback_data="home:more"),
    ])
    return text, InlineKeyboardMarkup(inline_keyboard=rows)


def more_view() -> tuple[str, InlineKeyboardMarkup]:
    """Everything a club player needs less often, one tap away from the home card."""
    contact = club_links().get("organizer_telegram")
    rows = _pairs([
        _app_button("📊 Статистика", "/player/games"),
        _app_button("🏆 Рейтинг", "/player/rating"),
        _app_button("🪙 Жетоны и магазин", "/player/wallet"),
        InlineKeyboardButton(text="📚 Обучение", callback_data="home:learn"),
        InlineKeyboardButton(text="💬 Группы", callback_data="home:groups"),
        InlineKeyboardButton(text="❓ Вопросы", callback_data="home:faq"),
    ])
    if contact:
        rows.append([InlineKeyboardButton(text="✉️ Написать организатору", url=contact)])
    rows.append(_back())
    return "☰ <b>Ещё</b>\n\nСтатистика, рейтинг, жетоны, обучение и наши группы 👇", InlineKeyboardMarkup(inline_keyboard=rows)


def game_view() -> tuple[str, InlineKeyboardMarkup]:
    text = (
        "🎭 <b>Что это за игра?</b>\n\n"
        "За столом собираются около десяти человек, и каждый тайно получает роль. Большинство — мирные жители, "
        "несколько человек — мафия. Мафия знает друг друга, а мирные — нет.\n\n"
        "🌙 <b>Ночью</b> все надевают маски, и мафия без слов выбирает, кого убить. Шериф в это время ищет мафию.\n"
        "☀️ <b>Днём</b> каждый по очереди говорит, а потом стол голосует — кто покинет игру.\n\n"
        "Мирные побеждают, когда вычислят всю мафию. Мафия — когда её станет столько же, сколько мирных.\n\n"
        "Звучит сложно? На деле уже после первой игры всё понятно — судья ведёт игру и всё подсказывает 🙂"
    )
    rows = _pairs([
        _app_button("📖 Правила", "/guide"),
        InlineKeyboardButton(text="🎬 Как играют", url=GAME_EXAMPLE_URL),
    ])
    rows.append([InlineKeyboardButton(text="📅 Записаться на вечер", callback_data="home:events")])
    rows.append(_back())
    return text, InlineKeyboardMarkup(inline_keyboard=rows)


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


KNOWN_START_PAYLOADS = ("players", "club_access")


def is_known_start_payload(args: str) -> bool:
    """A `start` payload the bot still understands; anything else is an old link that no longer leads anywhere."""
    args = (args or "").strip()
    return not args or args in KNOWN_START_PAYLOADS or args.startswith(("event_", "profile_"))


def nearest_evening(evenings: list[dict] | None) -> dict | None:
    """The soonest evening that has not started yet (the first one when no start time can be read)."""
    if not evenings:
        return None
    now = datetime.now(MOSCOW)
    upcoming = [item for item in evenings if (_parse(item.get("starts_at")) or now) >= now]
    pool = upcoming or evenings
    return sorted(pool, key=lambda item: str(item.get("starts_at") or ""))[0]


def stale_link_view(evenings: list[dict] | None, *, event_gone: bool = False) -> tuple[str, InlineKeyboardMarkup]:
    """An old link (a past or cancelled evening, an unknown `start` payload): say so plainly and give fresh buttons."""
    reason = "этот вечер уже прошёл или запись на него закрыта" if event_gone else "она устарела"
    soonest = nearest_evening(evenings)
    lines = [f"🔗 <b>Эта ссылка больше не работает</b> — {reason}."]
    buttons: list[InlineKeyboardButton | None] = []
    if soonest:
        lines.append(f"\nБлижайший вечер: <b>{_when(soonest.get('starts_at'))}</b>.")
        buttons.append(_app_button("📅 Ближайший вечер", bot_menu.event_app_path(str(soonest.get("id") or ""))))
    else:
        lines.append("\nБлижайших вечеров пока нет — анонс придёт сюда.")
    buttons.append(_app_button("🎭 Открыть 2LA Noire", "/player"))
    rows = [[button] for button in buttons if button]
    return "\n".join(lines), InlineKeyboardMarkup(inline_keyboard=rows)


def events_view(evenings: list[dict], audience: str = "club") -> tuple[str, InlineKeyboardMarkup]:
    newcomer = audience == "newcomer"
    title = "📅 <b>Вечера для новичков</b>" if newcomer else "📅 <b>Расписание</b>"
    if newcomer:
        evenings = [item for item in evenings if _is_novice_evening(item)]
    if not evenings:
        empty = (
            "Ближайший вечер для новичков ещё не объявлен. Как только откроем запись — пришлём анонс сюда 🙂"
            if newcomer else "Сейчас открытых вечеров нет. Анонс придёт сюда, как только откроем запись."
        )
        rows = []
        contact = club_links().get("organizer_telegram")
        if newcomer and contact:
            rows.append([InlineKeyboardButton(text="✉️ Спросить организатора", url=contact)])
        rows.append(_back())
        return f"{title}\n\n{empty}", InlineKeyboardMarkup(inline_keyboard=rows)
    lines = [title, ""]
    rows: list[list[InlineKeyboardButton]] = []
    for evening in evenings[:MAX_EVENINGS]:
        fmt = _FORMAT_SHORT.get(str(evening.get("format") or "").upper(), "🎭 вечер")
        coming = int(evening.get("attending_count") or 0)
        lines.append(f"<b>{_when(evening.get('starts_at'))}</b>" + ("" if newcomer else f" — {fmt}") + f"\n   уже идут: {coming}")
        start = _parse(evening.get("starts_at"))
        label = f"{start.day} {_MONTHS[start.month - 1]} · {start:%H:%M}" if start else "Вечер"
        rows.append([InlineKeyboardButton(text=label if newcomer else f"{label} · {fmt}", callback_data=f"home:ev:{evening.get('id')}")])
    lines.append("")
    lines.append("Нажми на вечер, чтобы записаться.")
    rows.append(_back())
    return "\n".join(lines), InlineKeyboardMarkup(inline_keyboard=rows)


def evening_view(evening: dict) -> tuple[str, InlineKeyboardMarkup]:
    evening_id = str(evening.get("id") or "")
    coming = int(evening.get("attending_count") or 0)
    thinking = int(evening.get("thinking_count") or 0)
    text = f"{event_base_text(evening)}\n\n👥 Идут: <b>{coming}</b>" + (f" · думают: {thinking}" if thinking else "") + "\n\n«✅ Буду» — на все игры. На часть вечера — выбери игры отдельно."
    rows = [
        [InlineKeyboardButton(text="✅ Буду", callback_data=f"evr:{evening_id}:going"),
         InlineKeyboardButton(text="⏳ Приду позже", callback_data=f"evr:{evening_id}:late")],
        [InlineKeyboardButton(text="🤔 Пока думаю", callback_data=f"evr:{evening_id}:thinking"),
         InlineKeyboardButton(text="❌ Не буду", callback_data=f"evr:{evening_id}:declined")],
    ]
    map_url = venue_map_url(evening.get("venue"))
    rows += _pairs([
        _app_button("🎯 Выбрать игры", bot_menu.event_app_path(evening_id)),
        InlineKeyboardButton(text="🗺 Как добраться", url=map_url) if map_url else None,
    ])
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
        lines = ["👤 <b>Мои записи</b>", "", f"Игрок: <b>{escape(str(player.get('nickname') or ''))}</b>", ""]
        if evenings:
            for evening in evenings:
                status = _STATUS_TEXT.get(str(evening.get("response_status")), "")
                games = int(evening.get("games") or 0)
                first_game = evening.get("first_game")
                games_text = (f" · с игры №{first_game}, всего {games}" if first_game and evening.get("response_status") == "late"
                              else f" · игр: {games}" if games
                              else " · уточни стартовую игру" if evening.get("response_status") == "late" else "")
                lines.append(f"• <b>{_when(evening.get('starts_at'))}</b> — {status}{games_text}")
                rows.append([InlineKeyboardButton(text=f"✏️ {_when(evening.get('starts_at'))}", callback_data=f"home:ev:{evening.get('id')}")])
        else:
            lines.append("Пока ты никуда не записан. Загляни в «📅 Расписание».")
        text = "\n".join(lines)
    profile = _app_button("👤 Открыть профиль", "/player")
    if profile:
        rows.append([profile])
    rows.append(_back())
    return text, InlineKeyboardMarkup(inline_keyboard=rows)


def lineups_view(evenings: list[dict]) -> tuple[str, InlineKeyboardMarkup]:
    rows = [[InlineKeyboardButton(text=f"{_when(item.get('starts_at'))} · идут {int(item.get('attending_count') or 0)}",
                                  callback_data=f"home:lineup:{item.get('id')}")] for item in evenings[:MAX_EVENINGS]]
    rows.append(_back())
    text = "👥 <b>Составы</b>\n\nКто уже записался — выбери вечер 👇" if evenings else "👥 <b>Составы</b>\n\nОткрытых вечеров пока нет."
    return text, InlineKeyboardMarkup(inline_keyboard=rows)


def faq_view() -> tuple[str, InlineKeyboardMarkup]:
    rows = _pairs([InlineKeyboardButton(text=button, callback_data=f"home:faq:{key}") for key, button, _ in FAQ])
    contact = club_links().get("organizer_telegram")
    if contact:
        rows.append([InlineKeyboardButton(text="✉️ Написать организатору", url=contact)])
    rows.append(_back())
    return "❓ <b>Частые вопросы</b>\n\nВыбери вопрос 👇", InlineKeyboardMarkup(inline_keyboard=rows)


def faq_answer_view(key: str) -> tuple[str, InlineKeyboardMarkup]:
    _, answer = _FAQ_BY_KEY.get(key, ("❓ Вопрос", "Ответ не найден."))
    title = _FAQ_TITLES.get(key, "❓ Вопрос")
    rows = []
    map_url = venue_map_url(None) if key == "place" else None
    if map_url:
        rows.append([InlineKeyboardButton(text="🗺 Как добраться", url=map_url)])
    if key == "novice":
        rows += _pairs([
            _app_button("📖 Правила игры", "/guide?tab=reference"),
            InlineKeyboardButton(text="🎬 Пример игры", url=GAME_EXAMPLE_URL),
        ])
    rows.append(_back("faq", "⬅️ К вопросам"))
    return f"<b>{escape(title)}</b>\n\n{escape(answer)}", InlineKeyboardMarkup(inline_keyboard=rows)


def learn_view(back_to: str = "more") -> tuple[str, InlineKeyboardMarkup]:
    rows = _pairs([
        _app_button("🎓 Школа мафии", "/guide"),
        _app_button("🧠 Тренажёры", "/guide?tab=trainers"),
        _app_button("📖 Правила", "/guide?tab=reference"),
        InlineKeyboardButton(text="🎬 Пример игры", url=GAME_EXAMPLE_URL),
    ])
    rows.append(_back(back_to))
    return (
        "📚 <b>Обучение</b>\n\nПравила простыми словами, словарь мафиозных слов и тренажёры — "
        "чтобы спокойно разобраться до вечера или потренироваться между играми.",
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
    rows.append(_back("more"))
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


async def _home_for(user_id: int, first_name: str | None) -> tuple[str, InlineKeyboardMarkup]:
    result = await get_player_home(user_id)
    home = result.get("data") if result.get("success") else None
    evenings = await _open_evenings() or []
    if audience_for(home) == "club":
        return club_home(first_name, home, evenings)
    return newcomer_home(first_name, evenings)


async def _audience(user_id: int) -> str:
    result = await get_player_home(user_id)
    return audience_for(result.get("data") if result.get("success") else None)


async def send_home(message: Message) -> None:
    first_name = message.from_user.first_name if message.from_user else None
    text, markup = await _home_for(message.from_user.id, first_name)
    await message.answer(text, parse_mode="HTML", reply_markup=markup, disable_web_page_preview=True)


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
    text, markup = events_view(evenings, await _audience(message.from_user.id))
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
        await _show(callback, *await _home_for(callback.from_user.id, callback.from_user.first_name))
    elif section == "game":
        await _show(callback, *game_view())
    elif section == "more":
        await _show(callback, *more_view())
    elif section == "events":
        evenings = await _open_evenings()
        if evenings is None:
            await callback.answer("Не получилось загрузить вечера. Попробуй чуть позже.", show_alert=True)
            return
        await _show(callback, *events_view(evenings, await _audience(callback.from_user.id)))
    elif section == "ev":
        evenings = await _open_evenings()
        if evenings is None:
            await callback.answer("Не удалось проверить вечер. Попробуй чуть позже.", show_alert=True)
            return
        evening = next((item for item in evenings if str(item.get("id")) == arg), None)
        if not evening:
            await _show(callback, *stale_link_view(evenings, event_gone=True))
            return
        await _show(callback, *evening_view(evening))
    elif section == "mine":
        result = await get_player_home(callback.from_user.id)
        error = result.get("error")
        if not result.get("success") and error != "not_found":
            await callback.answer("Не получилось получить записи. Попробуй ещё раз позже.", show_alert=True)
            return
        await _show(callback, *mine_view(result.get("data") if result.get("success") else None, error))
    elif section == "lineups":
        evenings = await _open_evenings()
        if evenings is None:
            await callback.answer("Не удалось загрузить составы. Попробуй чуть позже.", show_alert=True)
            return
        await _show(callback, *lineups_view(evenings))
    elif section == "lineup":
        evenings = await _open_evenings()
        if evenings is None:
            await callback.answer("Не получилось проверить состав. Попробуй позже.", show_alert=True)
            return
        if not any(str(evening.get("id")) == arg for evening in evenings):
            await _show(callback, *stale_link_view(evenings, event_gone=True))
            return
        from handlers.crm_booking import build_crm_evening_stats_text
        text = await build_crm_evening_stats_text(arg)
        markup = InlineKeyboardMarkup(inline_keyboard=[_back("lineups", "⬅️ К составам")])
        await _show(callback, text or "Не получилось загрузить состав. Попробуй чуть позже.", markup)
    elif section == "faq":
        await _show(callback, *(faq_answer_view(arg) if arg else faq_view()))
    elif section in ("learn", "rules"):  # «rules» came from cards sent before the regulations left the menu
        audience = await _audience(callback.from_user.id)
        await _show(callback, *learn_view("home" if audience == "newcomer" else "more"))
    elif section == "groups":
        result = await get_telegram_destinations()
        rows = ((result.get("data") or {}).get("destinations") or []) if result.get("success") else []
        await _show(callback, *groups_view(rows))
    elif section == "access":
        from handlers.registration import _handle_club_access, _main_menu
        await _handle_club_access(callback.message, await _main_menu(callback.from_user.id), callback.from_user)
        await callback.answer()
    else:
        await _show(callback, *stale_link_view(await _open_evenings()))
