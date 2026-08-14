from datetime import datetime
from html import escape

_FORMAT_LABELS = {
    "NOVICE": "Игра для новичков",
    "CASUAL": "Клубный игровой вечер",
    "STANDARD": "Клубный игровой вечер",
    "RATING": "Рейтинговый вечер",
    "TOURNAMENT": "Турнир",
}

_MONTHS_RU = (
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
)
_CLUB_GAME_PRICE = 100
_CLUB_EVENING_MAX_PRICE = 400


def format_start(value: object) -> str:
    raw = str(value or "")
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return f"{parsed.day} {_MONTHS_RU[parsed.month - 1]} · {parsed:%H:%M}"
    except (TypeError, ValueError):
        return raw or "Дата уточняется"


def _format_time(value: object) -> str:
    raw = str(value or "")
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).strftime("%H:%M")
    except (TypeError, ValueError):
        return raw or "—"


def _format_game_numbers(numbers: list[int]) -> str:
    values = sorted({int(value) for value in numbers if int(value) > 0})
    if not values:
        return "—"
    ranges: list[str] = []
    start = previous = values[0]
    for value in values[1:]:
        if value == previous + 1:
            previous = value
            continue
        ranges.append(str(start) if start == previous else f"{start}–{previous}")
        start = previous = value
    ranges.append(str(start) if start == previous else f"{start}–{previous}")
    return ", ".join(ranges)


def _price_text(evening: dict, slots: list[dict] | None = None) -> str | None:
    canonical_format = str(evening.get("canonical_format") or evening.get("format") or "CASUAL").upper()
    is_club = canonical_format in {"CASUAL", "STANDARD"}
    raw = evening.get("price_per_game")
    if raw is None and slots:
        raw = slots[0].get("price") if slots[0].get("price") is not None else slots[0].get("price_rub")
    if raw is None:
        raw = _CLUB_GAME_PRICE if is_club else evening.get("default_price")
    try:
        amount = int(float(raw or 0))
    except (TypeError, ValueError):
        return None
    if amount <= 0:
        return None
    if is_club:
        return f"{amount} ₽ за игру · максимум {_CLUB_EVENING_MAX_PRICE} ₽ за вечер"
    return f"{amount} ₽ за игру"


def event_base_text(evening: dict, slots: list[dict] | None = None) -> str:
    canonical_format = str(evening.get("canonical_format") or evening.get("format") or "CASUAL").upper()
    title = escape(str(evening.get("title") or _FORMAT_LABELS.get(canonical_format, "Игровой вечер")))
    venue = escape(str(evening.get("venue") or "Суп с Котом"))
    price = _price_text(evening, slots)
    notes = str(evening.get("notes") or "").strip()

    lines = [
        f"🎭 <b>{title}</b>",
        f"📅 {format_start(evening.get('starts_at'))}",
        f"📍 {venue}",
    ]
    if price:
        lines.append(f"💳 {price}")
    if notes:
        lines.extend(["", escape(notes[:700])])
    return "\n".join(lines)


def _slot_load_lines(slots: list[dict]) -> list[str]:
    if not slots:
        return ["🎲 <b>По играм</b>", "Игры вечера пока не настроены."]
    lines = ["🎲 <b>По играм</b>"]
    for slot in sorted(slots, key=lambda item: int(item.get("slot_number") or 0)):
        count = int(slot.get("registered_count") or len(slot.get("participants") or []))
        target = int(slot.get("target_players") or 11)
        ready = " ✅" if count >= target else ""
        lines.append(f"{_format_time(slot.get('starts_at'))} · игра {int(slot.get('slot_number') or 0)} — <b>{count}</b> игроков{ready}")
    return lines


def _arrival_lines(slots: list[dict]) -> list[str]:
    players: dict[str, dict] = {}
    for slot in slots:
        slot_number = int(slot.get("slot_number") or 0)
        starts_at = slot.get("starts_at")
        for participant in slot.get("participants") or []:
            player_id = str(participant.get("id") or participant.get("player_id") or participant.get("nickname") or "")
            if not player_id:
                continue
            item = players.setdefault(player_id, {
                "nickname": str(participant.get("nickname") or "Игрок"),
                "games": [],
                "first_number": slot_number,
                "first_starts_at": starts_at,
            })
            item["games"].append(slot_number)
            if slot_number and (not item["first_number"] or slot_number < item["first_number"]):
                item["first_number"] = slot_number
                item["first_starts_at"] = starts_at

    if not players:
        return ["👥 <b>Кто и к какому времени</b>", "Пока никто не выбрал игры."]

    ordered = sorted(
        players.values(),
        key=lambda item: (int(item.get("first_number") or 999), str(item.get("nickname") or "").casefold()),
    )
    lines = [f"👥 <b>Записались: {len(ordered)}</b>", "<b>Кто и к какому времени</b>"]
    max_players = 45
    for item in ordered[:max_players]:
        nickname = escape(str(item.get("nickname") or "Игрок"))
        games = _format_game_numbers(item.get("games") or [])
        lines.append(f"{_format_time(item.get('first_starts_at'))} — {nickname} · игры {games}")
    if len(ordered) > max_players:
        lines.append(f"…и ещё {len(ordered) - max_players} игроков")
    return lines


def private_event_text(evening: dict, *, reminder: bool = False) -> str:
    heading = "🔔 <b>Напоминание об игровом вечере</b>" if reminder else "🎭 <b>Игровой вечер 2LA Noire</b>"
    action = (
        "Ты ещё не выбрал игры. Открой вечер и отметь те игры, на которые придёшь."
        if reminder
        else "Открой вечер и отметь конкретные игры, на которые придёшь."
    )
    return (
        f"{heading}\n\n"
        f"{event_base_text(evening)}\n\n"
        f"{action}\n"
        "Сумма к оплате посчитается автоматически по выбранным играм."
    )


def thematic_event_text(evening: dict, slots: list[dict] | None = None) -> str:
    canonical_format = str(evening.get("canonical_format") or evening.get("format") or "CASUAL").upper()
    label = escape(_FORMAT_LABELS.get(canonical_format, "Игровой вечер"))
    slot_rows = slots or []
    sections = [
        f"{label} · <b>2LA Noire</b>",
        event_base_text(evening, slot_rows),
        "\n".join(_slot_load_lines(slot_rows)),
        "\n".join(_arrival_lines(slot_rows)),
        "Чтобы записаться или изменить свой план, выбери игры кнопкой ниже.",
    ]
    return "\n\n".join(section for section in sections if section)


def closed_event_text(evening: dict, *, cancelled: bool = False, obsolete: bool = False) -> str:
    if obsolete:
        heading = "ℹ️ Этот анонс больше не актуален"
    elif cancelled:
        heading = "❌ Событие отменено"
    else:
        heading = "🔒 Запись закрыта"
    return f"{heading}\n\n{event_base_text(evening)}"
