from __future__ import annotations

import asyncio
from collections import defaultdict
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
from handlers.telegram_evening_copy import closed_event_text, format_start, thematic_event_text


# One publication run at a time per evening (and one for the public router): a web retry
# that overlaps a slow first run must wait and then see the saved post instead of
# sending a second one.
_evening_locks: defaultdict[str, asyncio.Lock] = defaultdict(asyncio.Lock)
_router_lock = asyncio.Lock()


def evening_publication_lock(evening_id: str) -> asyncio.Lock:
    return _evening_locks[str(evening_id)]


async def _save_with_retry(operation, attempts: int = 3) -> dict:
    result: dict = {"success": False, "error": "backend_write_failed"}
    for attempt in range(max(1, attempts)):
        try:
            result = await operation()
        except Exception as exc:  # noqa: BLE001 - a failed save is reported, never raised
            result = {"success": False, "error": str(exc)}
        if result.get("success"):
            return result
        if attempt + 1 < attempts:
            await asyncio.sleep(0.5 * (attempt + 1))
    return result


async def _bot_url(bot: Bot, start: str | None = None) -> str | None:
    try:
        me = await bot.get_me()
        if not me.username:
            return None
        base = f"https://t.me/{me.username}"
        return f"{base}?start={start}" if start else base
    except Exception:
        return None


def _event_link_keyboard(evening_id: str, url: str | None) -> InlineKeyboardMarkup:
    return crm_evening_response_kb(evening_id, event_url=url)


async def _edit_message_status(
    bot: Bot,
    chat_id: str | int,
    message_id: int,
    text: str,
    reply_markup: InlineKeyboardMarkup | None,
) -> str:
    try:
        await bot.edit_message_text(
            chat_id=chat_id,
            message_id=int(message_id),
            text=text,
            parse_mode="HTML",
            reply_markup=reply_markup,
            disable_web_page_preview=True,
        )
        return "ok"
    except TelegramBadRequest as exc:
        if "message is not modified" in str(exc).lower():
            return "ok"
        text = str(exc).lower()
        if ("message" in text and "not found" in text) or "message_id_invalid" in text:
            return "missing"
        print(f"[TELEGRAM PUBLISH] Failed to edit {chat_id}/{message_id}: {exc}")
        return "failed"
    except Exception as exc:
        print(f"[TELEGRAM PUBLISH] Failed to edit {chat_id}/{message_id}: {exc}")
        return "failed"


async def _edit_message(
    bot: Bot,
    chat_id: str | int,
    message_id: int,
    text: str,
    reply_markup: InlineKeyboardMarkup | None,
) -> bool:
    return (await _edit_message_status(bot, chat_id, message_id, text, reply_markup)) == "ok"


async def _delete_message(bot: Bot, chat_id: str | int, message_id: int) -> bool:
    try:
        await bot.delete_message(chat_id=chat_id, message_id=int(message_id))
        return True
    except TelegramBadRequest as exc:
        message = str(exc).lower()
        if "message to delete not found" in message or "message not found" in message:
            return True
        print(f"[TELEGRAM PUBLISH] Failed to delete {chat_id}/{message_id}: {exc}")
        return False
    except Exception as exc:
        print(f"[TELEGRAM PUBLISH] Failed to delete {chat_id}/{message_id}: {exc}")
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


async def _cleanup_public_event_post(bot: Bot, publication: dict | None) -> bool:
    """Remove obsolete per-evening posts from the public welcome group.

    The public destination is router-only: it must contain one persistent navigation
    message that is edited in place, never separate evening announcements.
    """
    if not publication:
        return True
    chat_id = publication.get("chat_id")
    message_id = publication.get("message_id")
    if not chat_id or not message_id:
        return True
    try:
        return await _delete_message(bot, chat_id, int(message_id))
    except Exception:
        return False


async def _cleanup_current_public_event_posts(bot: Bot, evenings: list[dict | None]) -> list[dict]:
    results: list[dict] = []
    seen: set[str] = set()
    for evening in evenings:
        evening_id = str((evening or {}).get("id") or "").strip()
        if not evening_id or evening_id in seen:
            continue
        seen.add(evening_id)
        plan_result = await get_evening_telegram_plan(evening_id)
        if not plan_result.get("success"):
            results.append({"evening_id": evening_id, "success": False, "error": plan_result.get("error")})
            continue
        plan = plan_result.get("data") or {}
        publication = next(
            (
                item
                for item in (plan.get("publications") or [])
                if str(item.get("destination_id") or "") == "public"
            ),
            None,
        )
        if not publication:
            continue
        ok = await _cleanup_public_event_post(bot, publication)
        results.append({"evening_id": evening_id, "success": ok})
    return results


async def sync_evening_telegram(
    bot: Bot,
    evening_id: str,
    *,
    refresh_router: bool = True,
    allow_create: bool = True,
) -> dict:
    async with evening_publication_lock(evening_id):
        result = await _sync_evening_telegram_locked(bot, evening_id, allow_create=allow_create)
    if refresh_router:
        result["public_router"] = await sync_public_router(bot)
    return result


async def _sync_evening_telegram_locked(bot: Bot, evening_id: str, *, allow_create: bool) -> dict:
    plan_result = await get_evening_telegram_plan(evening_id)
    if not plan_result.get("success"):
        return {"success": False, "error": plan_result.get("error") or "plan_unavailable"}

    plan = plan_result.get("data") or {}
    evening = plan.get("evening") or {}
    slots = plan.get("slots") or []
    participants = plan.get("participants") or []
    destinations = {str(item.get("id")): item for item in (plan.get("destinations") or [])}
    publications = {str(item.get("destination_id")): item for item in (plan.get("publications") or [])}
    desired = {str(item) for item in (plan.get("desired_destination_ids") or [])}
    results: list[dict] = []

    # Public welcome group is router-only. Never create or refresh a separate evening post there.
    desired.discard("public")
    public_publication = publications.get("public")
    if public_publication:
        public_removed = await _cleanup_public_event_post(bot, public_publication)
        results.append({"destination_id": "public", "action": "removed_event_post", "success": public_removed})

    # Existing routed posts must become visibly inert once the evening is closed,
    # cancelled or routed away. Reuse the same message identity, remove the action
    # keyboard and never create a new post during finalization.
    cancelled = str(evening.get("status") or "") == "cancelled"
    for destination_id, publication in publications.items():
        if destination_id == "public" or destination_id in desired:
            continue
        edit_status = await _edit_message_status(
            bot,
            publication.get("chat_id"),
            int(publication.get("message_id")),
            closed_event_text(evening, cancelled=cancelled),
            None,
        )
        results.append({
            "destination_id": destination_id,
            "action": "finalized",
            # A deleted historical post is already finalized; do not keep the
            # durable outbox in a permanent 502 retry loop for it.
            "success": edit_status in {"ok", "missing"},
        })

    event_url = await _bot_url(bot, f"event_{evening_id}")
    event_keyboard = _event_link_keyboard(evening_id, event_url)

    for destination_id in desired:
        destination = destinations.get(destination_id) or {}
        publication = publications.get(destination_id)
        text = thematic_event_text(evening, slots, participants)

        if publication:
            edit_status = await _edit_message_status(
                bot,
                publication.get("chat_id"),
                int(publication.get("message_id")),
                text,
                event_keyboard,
            )
            if edit_status == "ok":
                results.append({"destination_id": destination_id, "action": "edited", "success": True})
                continue
            if edit_status != "missing":
                results.append({"destination_id": destination_id, "action": "edit_failed", "success": False})
                continue
            # Telegram may have pruned the old message while our DB still
            # points to it. Recreate the post and let the upserted publication
            # row become the new source of truth.
            print(f"[TELEGRAM PUBLISH] Recreating missing {destination_id} post for {evening_id}")

        if not allow_create or not destination.get("active") or not str(destination.get("chat_id") or "").strip():
            results.append({"destination_id": destination_id, "action": "skipped", "success": True})
            continue

        chat_id = str(destination.get("chat_id")).strip()
        topic_id = destination.get("topic_id")
        try:
            message = await _send_message(bot, chat_id, int(topic_id) if topic_id else None, text, event_keyboard)
            saved = await _save_with_retry(lambda: save_evening_telegram_publication(
                evening_id,
                destination_id,
                chat_id,
                int(topic_id) if topic_id else None,
                message.message_id,
            ))
            if not saved.get("success"):
                # An unsaved post would be sent again on the next run. Remove it so the
                # retry publishes exactly one post.
                removed = await _delete_message(bot, chat_id, message.message_id)
                print(f"[TELEGRAM PUBLISH] Post for {evening_id}/{destination_id} not saved; removed={removed}")
            results.append({
                "destination_id": destination_id,
                "action": "created" if saved.get("success") else "create_unsaved",
                "success": bool(saved.get("success")),
                "message_id": message.message_id,
            })
        except Exception as exc:
            print(f"[TELEGRAM PUBLISH] Failed to send {destination_id} for {evening_id}: {exc}")
            results.append({"destination_id": destination_id, "action": "create_failed", "success": False, "error": str(exc)})

    failures = [item for item in results if not item.get("success")]
    return {
        "success": not failures,
        "evening_id": evening_id,
        "results": results,
        "public_router": None,
    }


def _router_event_block(title: str, empty_text: str, evening: dict | None) -> list[str]:
    if not evening:
        return [title, empty_text]
    lines = [title, f"Ближайшая игра: <b>{format_start(evening.get('starts_at'))}</b>"]
    if evening.get("venue"):
        lines.append(f"📍 {escape(str(evening.get('venue')))}")
    return lines


async def sync_public_router(bot: Bot) -> dict:
    async with _router_lock:
        return await _sync_public_router_locked(bot)


async def _sync_public_router_locked(bot: Bot) -> dict:
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

    cleanup_results = await _cleanup_current_public_event_posts(bot, [novice_evening, club_evening])

    bot_url = await _bot_url(bot)
    club_access_url = await _bot_url(bot, "club_access")
    novice_event_url = await _bot_url(bot, f"event_{novice_evening.get('id')}") if novice_evening else None
    club_event_url = await _bot_url(bot, f"event_{club_evening.get('id')}") if club_evening else None

    lines = [
        "🎭 <b>Спортивная мафия в Туле | 2LA Noire</b>",
        "",
        "Хочешь поиграть? Выбери подходящий формат:",
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
        "",
        "Для точного выбора игр открой нужный вечер. Быстрый ответ на клубный анонс можно дать прямо в Telegram.",
        "Доступ в основной клуб — после подтверждения организатора.",
    ]
    text = "\n".join(lines)

    keyboard_rows: list[list[InlineKeyboardButton]] = []
    if novice_event_url:
        keyboard_rows.append([InlineKeyboardButton(text="🌱 Выбрать игры новичкам", url=novice_event_url)])
    if club_event_url:
        keyboard_rows.append([InlineKeyboardButton(text="🎭 Выбрать игры клуба", url=club_event_url)])

    novice_url = str(novice_destination.get("invite_url") or "").strip()
    if novice_url:
        keyboard_rows.append([InlineKeyboardButton(text="🌱 Школа мафии", url=novice_url)])
    if club_access_url:
        keyboard_rows.append([InlineKeyboardButton(text="🎟 Проверить доступ в основной клуб", url=club_access_url)])
    if not novice_event_url and not club_event_url and bot_url:
        keyboard_rows.append([InlineKeyboardButton(text="🤖 Открыть бота", url=bot_url)])
    keyboard = InlineKeyboardMarkup(inline_keyboard=keyboard_rows) if keyboard_rows else None

    cleanup_failed = [item for item in cleanup_results if not item.get("success")]
    chat_id = str(public_destination.get("chat_id")).strip()
    message_id = public_destination.get("router_message_id")
    if message_id:
        edit_status = await _edit_message_status(bot, chat_id, int(message_id), text, keyboard)
        if edit_status == "ok":
            return {
                "success": not cleanup_failed,
                "action": "edited",
                "message_id": int(message_id),
                "cleanup": cleanup_results,
            }
        if edit_status != "missing":
            # A temporary Telegram or network error is not a reason for a second pinned
            # message: keep the existing one and try again on the next refresh.
            return {"success": False, "error": "router_edit_failed", "cleanup": cleanup_results}

    try:
        message = await _send_message(bot, chat_id, None, text, keyboard)
        saved = await _save_with_retry(lambda: save_public_router_message_id(message.message_id))
        if not saved.get("success"):
            await _delete_message(bot, chat_id, message.message_id)
            return {"success": False, "error": "router_not_saved", "cleanup": cleanup_results}
        try:
            await bot.pin_chat_message(chat_id=chat_id, message_id=message.message_id, disable_notification=True)
        except Exception as exc:
            print(f"[TELEGRAM ROUTER] Message sent but pin failed: {exc}")
        return {
            "success": not cleanup_failed,
            "action": "created",
            "message_id": message.message_id,
            "cleanup": cleanup_results,
        }
    except Exception as exc:
        print(f"[TELEGRAM ROUTER] Failed to create public router: {exc}")
        return {"success": False, "error": str(exc), "cleanup": cleanup_results}


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
            f"✅ <b>2LA Noire</b>\nTelegram-направление «{escape(str(destination.get('name') or destination_id))}» настроено.",
            None,
        )
        return {"success": True, "message_id": message.message_id, "destination_id": destination_id}
    except Exception as exc:
        return {"success": False, "error": str(exc), "destination_id": destination_id}

