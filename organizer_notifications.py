import asyncio
import datetime as dt
import hashlib
import logging
from typing import Any
from zoneinfo import ZoneInfo

from aiogram import Bot

import config
from bot_announcement_api import get_evening_recruitment_state
from bot_api import get_evening_participants, get_open_evenings

logger = logging.getLogger(__name__)
MOSCOW = ZoneInfo("Europe/Moscow")

_LAST_DIGEST_HASH: str | None = None
_LAST_SENT_AT: dt.datetime | None = None


def _parse_dt(value: Any) -> dt.datetime | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        parsed = dt.datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=MOSCOW)
        return parsed.astimezone(MOSCOW)
    except ValueError:
        return None


def _money(value: Any) -> int:
    try:
        return max(0, int(round(float(value or 0))))
    except (TypeError, ValueError):
        return 0


def _nickname_list(items: list[dict[str, Any]], limit: int = 8) -> str:
    names = [str(item.get("nickname") or "Игрок") for item in items]
    shown = names[:limit]
    suffix = f" +{len(names) - limit}" if len(names) > limit else ""
    return ", ".join(shown) + suffix


def build_organizer_digest(
    evenings: list[dict[str, Any]],
    details_by_evening: dict[str, dict[str, Any]],
    recruitment_by_evening: dict[str, dict[str, Any]],
    *,
    now: dt.datetime | None = None,
) -> str | None:
    now = (now or dt.datetime.now(MOSCOW)).astimezone(MOSCOW)
    blocks: list[str] = []

    for evening in evenings:
        evening_id = str(evening.get("id") or "")
        if not evening_id:
            continue
        starts_at = _parse_dt(evening.get("starts_at"))
        if starts_at is None:
            continue
        hours_to_start = (starts_at - now).total_seconds() / 3600
        if hours_to_start > 7 * 24 or hours_to_start < -18:
            continue

        detail = details_by_evening.get(evening_id) or {}
        participants = detail.get("participants") if isinstance(detail.get("participants"), list) else []
        attending = [p for p in participants if str(p.get("response_status") or "") in {"going", "late"}]
        thinking = [p for p in participants if str(p.get("response_status") or "") == "thinking"]
        unanswered = [p for p in participants if str(p.get("response_status") or "") in {"", "unanswered"}]
        unresolved_attendance = [
            p for p in attending if str(p.get("attendance_status") or "pending") == "pending"
        ]
        unpaid = []
        for participant in attending:
            due = _money(participant.get("amount_due"))
            paid = _money(participant.get("amount_paid"))
            if due > paid and str(participant.get("payment_status") or "") not in {"paid", "waived"}:
                unpaid.append({**participant, "remaining": due - paid})

        recruitment = recruitment_by_evening.get(evening_id) or {}
        underfilled_slots = recruitment.get("underfilled_slots") if isinstance(recruitment.get("underfilled_slots"), list) else []
        capacity = max(0, int(evening.get("capacity") or 10))
        attending_count = len(attending) if participants else int(evening.get("attending_count") or 0)

        lines: list[str] = []
        if hours_to_start <= 48 and hours_to_start > -6 and attending_count < min(10, capacity or 10):
            lines.append(f"⚠️ Запись: {attending_count}/10 — не хватает {10 - attending_count}")
        elif 0 <= hours_to_start <= 12 and attending_count >= 10:
            lines.append(f"✅ По людям готово: подтверждено {attending_count}")

        if hours_to_start <= 48 and thinking:
            lines.append(f"🤔 Думают ({len(thinking)}): {_nickname_list(thinking)}")
        if 0 <= hours_to_start <= 24 and unanswered:
            lines.append(f"❔ Без ответа ({len(unanswered)}): {_nickname_list(unanswered)}")
        if underfilled_slots and hours_to_start <= 72:
            labels = []
            for slot in underfilled_slots[:6]:
                if isinstance(slot, dict):
                    labels.append(str(slot.get("title") or slot.get("name") or slot.get("label") or slot.get("slot_number") or "игра"))
                else:
                    labels.append(str(slot))
            lines.append(f"🎯 Не заполнены игровые слоты: {', '.join(labels)}")
        if hours_to_start <= 6 and unpaid:
            payment_text = ", ".join(
                f"{p.get('nickname') or 'Игрок'} — {_money(p.get('remaining'))} ₽" for p in unpaid[:8]
            )
            if len(unpaid) > 8:
                payment_text += f" +{len(unpaid) - 8}"
            lines.append(f"💳 Оплата под контролем ({len(unpaid)}): {payment_text}")
        if hours_to_start <= 0 and unresolved_attendance:
            lines.append(f"👥 Не отмечена явка ({len(unresolved_attendance)}): {_nickname_list(unresolved_attendance)}")
        if hours_to_start < -5 and str(evening.get("status") or "") == "active":
            lines.append("🔒 Вечер всё ещё активен — проверь закрытие, оплаты и протоколы")

        if not lines:
            continue
        title = str(evening.get("title") or "Игровой вечер")
        when = starts_at.strftime("%d.%m %H:%M")
        blocks.append(f"<b>{title}</b> · {when}\n" + "\n".join(lines))

    if not blocks:
        return None
    return "🚨 <b>CRM · важно</b>\n\n" + "\n\n".join(blocks)


async def collect_organizer_digest() -> str | None:
    evenings_result = await get_open_evenings()
    if not evenings_result.get("success"):
        raise RuntimeError(f"open_evenings:{evenings_result.get('error') or 'unavailable'}")

    evenings = evenings_result.get("data") or []
    details: dict[str, dict[str, Any]] = {}
    recruitment: dict[str, dict[str, Any]] = {}
    for evening in evenings:
        evening_id = str(evening.get("id") or "")
        if not evening_id:
            continue
        participant_result, recruitment_result = await asyncio.gather(
            get_evening_participants(evening_id),
            get_evening_recruitment_state(evening_id),
        )
        if participant_result.get("success"):
            details[evening_id] = participant_result.get("data") or {}
        if recruitment_result.get("success"):
            recruitment[evening_id] = recruitment_result.get("data") or {}

    return build_organizer_digest(evenings, details, recruitment)


async def send_organizer_digest_if_needed(bot: Bot, *, force: bool = False) -> bool:
    global _LAST_DIGEST_HASH, _LAST_SENT_AT
    digest = await collect_organizer_digest()
    if not digest:
        return False

    digest_hash = hashlib.sha256(digest.encode("utf-8")).hexdigest()
    now = dt.datetime.now(MOSCOW)
    repeat_due = _LAST_SENT_AT is None or (now - _LAST_SENT_AT) >= dt.timedelta(hours=6)
    if not force and digest_hash == _LAST_DIGEST_HASH and not repeat_due:
        return False

    sent = False
    for chat_id in config.ORGANIZER_NOTIFICATION_IDS:
        try:
            await bot.send_message(chat_id, digest, parse_mode="HTML")
            sent = True
        except Exception as exc:
            logger.warning("Не удалось отправить CRM-уведомление организатору %s: %s", chat_id, exc)
    if sent:
        _LAST_DIGEST_HASH = digest_hash
        _LAST_SENT_AT = now
    return sent


async def organizer_notification_task(bot: Bot) -> None:
    await asyncio.sleep(25)
    while True:
        try:
            await send_organizer_digest_if_needed(bot)
        except Exception as exc:
            logger.warning("Ошибка CRM-уведомлений организатора: %s", exc)
        await asyncio.sleep(max(5, config.ORGANIZER_NOTIFICATION_INTERVAL_MINUTES) * 60)
