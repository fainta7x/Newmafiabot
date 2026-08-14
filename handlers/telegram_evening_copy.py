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


def format_start(value: object) -> str:
    raw = str(value or "")
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return f"{parsed.day} {_MONTHS_RU[parsed.month - 1]} · {parsed:%H:%M}"
    except (TypeError, ValueError):
        return raw or "Дата уточняется"


def _price_per_game(value: object) -> str | None:
    try:
        amount = int(float(value or 0))
    except (TypeError, ValueError):
        return None
    return f"{amount} ₽ за игру" if amount > 0 else None


def event_base_text(evening: dict) -> str:
    canonical_format = str(evening.get("canonical_format") or evening.get("format") or "CASUAL").upper()
    title = escape(str(evening.get("title") or _FORMAT_LABELS.get(canonical_format, "Игровой вечер")))
    venue = escape(str(evening.get("venue") or "Суп с Котом"))
    price = _price_per_game(evening.get("default_price"))
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


def thematic_event_text(evening: dict) -> str:
    canonical_format = str(evening.get("canonical_format") or evening.get("format") or "CASUAL").upper()
    label = escape(_FORMAT_LABELS.get(canonical_format, "Игровой вечер"))
    return (
        f"{label} · <b>2LA Noire</b>\n\n"
        f"{event_base_text(evening)}\n\n"
        "Запись идёт по отдельным играм вечера. Выбери в приложении только те игры, на которые придёшь — "
        "стоимость посчитается автоматически."
    )


def closed_event_text(evening: dict, *, cancelled: bool = False, obsolete: bool = False) -> str:
    if obsolete:
        heading = "ℹ️ Этот анонс больше не актуален"
    elif cancelled:
        heading = "❌ Событие отменено"
    else:
        heading = "🔒 Запись закрыта"
    return f"{heading}\n\n{event_base_text(evening)}"
