from __future__ import annotations

from datetime import datetime
from html import escape

from aiogram import Bot
from aiogram.exceptions import TelegramBadRequest
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from bot_telegram_api import (
    get_evening_telegram_plan,
    get_public_router_payload,
    get_telegram_destinations,
    save_evening_telegram_publication,
    save_public_router_message_id,
)
from crm_evening_keyboard import crm_evening_response_kb


_RESPONSE_LABELS = {
    "going": "✅ Идут",
    "late": "⏳ Придут позже",
    "thinking": "🤔 Пока думают",
    "declined": "❌ Не идут",
}

_FORMAT_LABELS = {
    "NOVICE": "Игра для новичков",
    "CASUAL": "Клубный игровой вечер",
    "RATING": "Рейтинговый вечер",
    "TOURNAMENT": "Турнир",
}

_MONTHS_RU = (
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
)


def _format_start(value: object) -> str:
    raw = str(value or "")
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return f"{parsed.day} {_MONTHS_RU[parsed.month - 1]} · {parsed:%H:%M}"
    except (TypeError, ValueError):
        return raw or "Дата уточняется"


def _price(value: object) -> str | None:
    try:
        amount = int(float(value or 0))
    except (TypeError, ValueError):
        return None
    return f"{amount} ₽" if amount > 0 else None


async def _bot_url(bot: Bot, start: str | None = None) -> str | None:
    try:
        me = await bot.get_me()
        if not me.username:
            return None
        base = f"https://t.me/{me.username}"
        return f"{base}?start={start}" if start else base
    except Exception:
        return None


def _grouped_participants(participants: list[dict]) -> dict[str, list[str]]:
    grouped = {key: [] for key in _RESPONSE_LABELS}
    for participant in participants:
        status = str(participant.get("response_status") or "")
        if status in grouped:
            grouped[status].append(str(participant.get("nickname") or "Игрок"))
    return grouped


def _stats_text(participants: list[dict]) -> str:
    grouped = _grouped_participants(participants)
    expected = len(grouped["going"]) + len(grouped["late"])
    lines = [f"\n👥 Планируют прийти: <b>{expected}</b>"]
    for status, label in _RESPONSE_LABELS.items():
        names = grouped[status]
        if names:
            lines.append(f"{label}: " + ", ".join(escape(name) for name in names))
    return "\n".join(lines)


def _event_base_text(evening: dict) -> str:
    canonical_format = str(evening.get("canonical_format") or evening.get("format") or "CASUAL")
    title = escape(str(evening.get("title") or _FORMAT_LABELS.get(canonical_format, "Игровой вечер")))
    venue = escape(str(evening.get("venue") or "Суп с Котом"))
    price = _price(evening.get("default_price"))
    notes = str(evening.get("notes") or "").strip()

    lines = [
        f"🎭 <b>{title}</b>",
        f"📅 {_format_start(evening.get('starts_at'))}",
        f"📍 {venue}",
    ]
    if price:
        lines.append(f"💳 {price}")
    if notes:
        lines.extend(["", escape(notes[:700])])
    return "\n".join(lines)


def _thematic_event_text(evening: dict, participants: list[dict]) -> str:
    canonical_format = str(evening.get("canonical_format") or evening.get("format") or "CASUAL")
    label = _FORMAT_LABELS.get(canonical_format, "Игровой вечер")
    return f"{escape(label)} · 2LA noire\n\n{_event_base_text(evening)}\n{_stats_text(participants)}\n\nКак планируешь?"


def _public_event_text(evening: dict) -> str:
    canonical_format = str(evening.get("canonical_format") or evening.get("format") or "CASUAL")
    if canonical_format == "NOVICE":
        intro = "🌱 <b>Игра для новичков</b> — можно спокойно начать со Школы мафии."
    else:
        intro = (
            "🎭 <b>Клубный игровой вечер</b>\n"
            "Для игроков, уже знакомых со спортивной мафией. "
            "Доступ в основной клуб — после подтверждения организатора."
        )
    return f"{intro}\n\n{_event_base_text(evening)}"


def _closed_text(evening: dict, cancelled: bool = False, obsolete: bool = False) -> str:
    if obsolete:
        heading = "ℹ️ Этот анонс больше не актуален"
    elif cancelled:
        heading = "❌ Событие отменено"
    else:
        heading = "🔒 Запись закрыта"
    return f"{heading}\n\n{_event_base_text(evening)}"


def _public_event_keyboard(
    school_url: str | None,
    bot_url: str | None,
    club_access_url: str | None,
    novice: bool,
) -> InlineKeyboardMarkup | None:
    rows: list[list[InlineKeyboardButton]] = []
    if novice and school_url:
        rows.append([InlineKeyboardButton(text="🌱 Школа мафии", url=school_url)])
    if not novice and club_access_url:
        rows.append([InlineKeyboardButton(text="🎭 Проверить доступ в основной клуб", url=club_access_url)])
    if bot_url:
        rows.append([InlineKeyboardButton(text="🤖 Записаться на игру", url=bot_url)])
    return InlineKeyboardMarkup(inline_keyboard=rows) if rows else None


async def _edit_message(
    bot: Bot,
    chat_id: str | int,
    message_id: int,
    text: str,
    reply_markup: InlineKeyboardMarkup | None,
) -> bool:
    try:
        await bot.edit_message_text(
            chat_id=chat_id,
            message_id=int(message_id),
            text=text,
            parse_mode="HTML",
            reply_markup=reply_markup,
            disable_web_page_preview=True,
        )
        return True
    except TelegramBadRequest as exc:
        if "message is not modified" in str(exc).lower():
            return True
        print(f"[TELEGRAM PUBLISH] Failed to edit {chat_id}/{message_id}: {exc}")
        return False
    except Exception as exc:
        print(f"[TELEGRAM PUBLISH] Failed to edit {chat_id}/{message_id}: {exc}")
        return False


async def _send_message(
    bot: Bot,
    chat_id: str | int,
    topic_id: int | None,
    text: str,
    reply_markup: InlineKeyboardMarkup | None,
):
    kwargs = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "reply_markup": reply_markup,
        "disable_web_page_preview": True,
    }
    if topic_id:
        kwargs["message_thread_id"] = int(topic_id)
    return await bot.send_message(**kwargs)


async def sync_evening_telegram(
    bot: Bot,
    evening_id: str,
    *,
    refresh_router: bool = True,
    allow_create: bool = True,
) -> dict:
    plan_result = await get_evening_telegram_plan(evening_id)
    if not plan_result.get("success"):
        return {"success": False, "error": plan_result.get("error") or "plan_unavailable"}

    plan = plan_result.get("data") or {}
    evening = plan.get("evening") or {}
    participants = plan.get("participants") or []
    destinations = {str(item.get("id")): item for item in (plan.get("destinations") or [])}
    publications = {str(item.get("destination_id")): item for item in (plan.get("publications") or [])}
    desired = {str(item) for item in (plan.get("desired_destination_ids") or [])}
    bot_url = await _bot_url(bot)
    club_access_url = await _bot_url(bot, "club_access")
    results: list[dict] = []

    for destination_id, publication in publications.items():
        if destination_id in desired:
            continue
        status = str(evening.get("status") or "")
        text = _closed_text(
            evening,
            cancelled=status == "cancelled",
            obsolete=status in {"published", "active"},
        )
        ok = await _edit_message(
            bot,
            publication.get("chat_id"),
            int(publication.get("message_id")),
            text,
            None,
        )
        results.append({"destination_id": destination_id, "action": "closed", "success": ok})

    for destination_id in desired:
        destination = destinations.get(destination_id) or {}
        publication = publications.get(destination_id)
        is_public = destination_id == "public"
        canonical_format = str(evening.get("canonical_format") or "CASUAL")

        if is_public:
            novice_destination = destinations.get("novice") or {}
            text = _public_event_text(evening)
            keyboard = _public_event_keyboard(
                str(novice_destination.get("invite_url") or "").strip() or None,
                bot_url,
                club_access_url,
                canonical_format == "NOVICE",
            )
        else:
            text = _thematic_event_text(evening, participants)
            keyboard = crm_evening_response_kb(evening_id)

        if publication:
            ok = await _edit_message(
                bot,
                publication.get("chat_id"),
                int(publication.get("message_id")),
                text,
                keyboard,
            )
            results.append({"destination_id": destination_id, "action": "edited", "success": ok})
            continue

        if not allow_create or not destination.get("active") or not str(destination.get("chat_id") or "").strip():
            results.append({"destination_id": destination_id, "action": "skipped", "success": True})
            continue

        chat_id = str(destination.get("chat_id")).strip()
        topic_id = destination.get("topic_id")
        try:
            message = await _send_message(bot, chat_id, int(topic_id) if topic_id else None, text, keyboard)
            saved = await save_evening_telegram_publication(
                evening_id,
                destination_id,
                chat_id,
                int(topic_id) if topic_id else None,
                message.message_id,
            )
            results.append({
                "destination_id": destination_id,
                "action": "created",
                "success": bool(saved.get("success")),
                "message_id": message.message_id,
            })
        except Exception as exc:
            print(f"[TELEGRAM PUBLISH] Failed to send {destination_id} for {evening_id}: {exc}")
            results.append({"destination_id": destination_id, "action": "create_failed", "success": False, "error": str(exc)})

    router_result = await sync_public_router(bot) if refresh_router else None
    failures = [item for item in results if not item.get("success")]
    return {
        "success": not failures,
        "evening_id": evening_id,
        "results": results,
        "public_router": router_result,
    }


def _router_event_block(title: str, empty_text: str, evening: dict | None) -> list[str]:
    if not evening:
        return [title, empty_text]
    lines = [title, f"Ближайшая игра: <b>{_format_start(evening.get('starts_at'))}</b>"]
    if evening.get("venue"):
        lines.append(f"📍 {escape(str(evening.get('venue')))}")
    return lines


async def sync_public_router(bot: Bot) -> dict:
    payload_result = await get_public_router_payload()
    if not payload_result.get("success"):
        return {"success": False, "error": payload_result.get("error") or "router_unavailable"}

    payload = payload_result.get("data") or {}
    public_destination = payload.get("public_destination") or {}
    if not public_destination.get("active") or not str(public_destination.get("chat_id") or "").strip():
        return {"success": True, "skipped": True, "reason": "public_destination_disabled"}

    novice_destination = payload.get("novice_destination") or {}
    novice_evening = payload.get("novice_evening")
    club_evening = payload.get("club_evening")
    bot_url = await _bot_url(bot)
    club_access_url = await _bot_url(bot, "club_access")

    lines = [
        "🎭 <b>Спортивная мафия в Туле | 2LA Noire</b>",
        "",
        "Хотите поиграть? Выберите подходящий вариант:",
        "",
        *_router_event_block(
            "🌱 <b>Я новичок или играл совсем немного</b>",
            "Ближайшая игра для новичков пока не назначена.",
            novice_evening,
        ),
        "",
        *_router_event_block(
            "🎭 <b>Я уже играю в спортивную мафию</b>",
            "Ближайший клубный вечер пока не назначен.",
            club_evening,
        ),
        "Доступ в основной клуб — после подтверждения организатора.",
    ]
    text = "\n".join(lines)

    keyboard_rows: list[list[InlineKeyboardButton]] = []
    novice_url = str(novice_destination.get("invite_url") or "").strip()
    if novice_url:
        keyboard_rows.append([InlineKeyboardButton(text="🌱 Школа мафии", url=novice_url)])
    if club_access_url:
        keyboard_rows.append([InlineKeyboardButton(text="🎭 Проверить доступ в основной клуб", url=club_access_url)])
    if bot_url:
        keyboard_rows.append([InlineKeyboardButton(text="🤖 Записаться на игру", url=bot_url)])
    keyboard = InlineKeyboardMarkup(inline_keyboard=keyboard_rows) if keyboard_rows else None

    chat_id = str(public_destination.get("chat_id")).strip()
    message_id = public_destination.get("router_message_id")
    if message_id:
        edited = await _edit_message(bot, chat_id, int(message_id), text, keyboard)
        if edited:
            return {"success": True, "action": "edited", "message_id": int(message_id)}

    try:
        message = await _send_message(bot, chat_id, None, text, keyboard)
        await save_public_router_message_id(message.message_id)
        try:
            await bot.pin_chat_message(chat_id=chat_id, message_id=message.message_id, disable_notification=True)
        except Exception as exc:
            print(f"[TELEGRAM ROUTER] Message sent but pin failed: {exc}")
        return {"success": True, "action": "created", "message_id": message.message_id}
    except Exception as exc:
        print(f"[TELEGRAM ROUTER] Failed to create public router: {exc}")
        return {"success": False, "error": str(exc)}


async def test_telegram_destination(bot: Bot, destination_id: str) -> dict:
    result = await get_telegram_destinations()
    if not result.get("success"):
        return {"success": False, "error": result.get("error") or "settings_unavailable"}
    destinations = (result.get("data") or {}).get("destinations") or []
    destination = next((item for item in destinations if str(item.get("id")) == destination_id), None)
    if not destination:
        return {"success": False, "error": "destination_not_found"}
    chat_id = str(destination.get("chat_id") or "").strip()
    if not chat_id:
        return {"success": False, "error": "chat_id_missing"}
    topic_id = destination.get("topic_id")
    try:
        message = await _send_message(
            bot,
            chat_id,
            int(topic_id) if topic_id else None,
            f"✅ <b>2LA noire</b>\nTelegram-направление «{escape(str(destination.get('name') or destination_id))}» настроено.",
            None,
        )
        return {"success": True, "message_id": message.message_id, "destination_id": destination_id}
    except Exception as exc:
        return {"success": False, "error": str(exc), "destination_id": destination_id}
