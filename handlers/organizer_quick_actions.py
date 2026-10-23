"""Quick answers to organizer tasks under the bot's notifications (owner request, 2026-10-23).

Buttons ``otask:done:<id>`` close the task and ``otask:snooze:<id>`` move its deadline to tomorrow 10:00 Moscow time.
The server decides who may press them: only the organizers who receive these notifications.
"""
from __future__ import annotations

import logging

from aiogram import F, Router
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup

from bot_announcement_api import apply_organizer_task_action

logger = logging.getLogger(__name__)
router = Router()

CALLBACK_PREFIX = "otask:"
TELEGRAM_CALLBACK_LIMIT = 64
_ACTIONS = {"done", "snooze"}


def task_callback(action: str, task_id: str) -> str:
    return f"{CALLBACK_PREFIX}{action}:{task_id}"


def _short(title: str, limit: int = 24) -> str:
    return title if len(title) <= limit else f"{title[: limit - 1]}…"


def task_button_rows(tasks: list[dict], limit: int = 5) -> list[list[InlineKeyboardButton]]:
    """One row per task: «✅ <title>» and «⏰ Завтра»; a task whose id does not fit Telegram's limit gets no row."""
    rows: list[list[InlineKeyboardButton]] = []
    for task in tasks[:limit]:
        task_id = str(task.get("id") or "")
        if not task_id or len(task_callback("snooze", task_id).encode("utf-8")) > TELEGRAM_CALLBACK_LIMIT:
            continue
        title = str(task.get("title") or "Задача")
        rows.append([
            InlineKeyboardButton(text=f"✅ {_short(title)}", callback_data=task_callback("done", task_id)),
            InlineKeyboardButton(text="⏰ Завтра", callback_data=task_callback("snooze", task_id)),
        ])
    return rows


def _without_task(markup: InlineKeyboardMarkup | None, task_id: str) -> InlineKeyboardMarkup | None:
    if markup is None:
        return None
    rows = [
        row for row in markup.inline_keyboard
        if not any((button.callback_data or "").endswith(f":{task_id}") and (button.callback_data or "").startswith(CALLBACK_PREFIX) for button in row)
    ]
    return InlineKeyboardMarkup(inline_keyboard=rows) if rows else None


_ERRORS = {
    "authorization": "Это действие доступно только организаторам.",
    "not_found": "Задача не найдена — возможно, её удалили.",
    "invalid": "Не понял действие.",
}


@router.callback_query(F.data.startswith(CALLBACK_PREFIX))
async def handle_organizer_task_action(callback: CallbackQuery) -> None:
    parts = (callback.data or "").split(":", 2)
    if len(parts) != 3 or parts[1] not in _ACTIONS or not parts[2] or not callback.from_user:
        await callback.answer("Не понял действие.", show_alert=True)
        return
    _, action, task_id = parts
    result = await apply_organizer_task_action(task_id, action, callback.from_user.id)
    if not result.get("success"):
        await callback.answer(_ERRORS.get(str(result.get("error")), "Не получилось, попробуйте ещё раз."), show_alert=True)
        return

    title = str((result.get("data") or {}).get("title") or "Задача")
    await callback.answer(f"✅ Сделано: {title}" if action == "done" else f"⏰ Перенесено на завтра: {title}")
    if callback.message is not None:
        try:
            await callback.message.edit_reply_markup(reply_markup=_without_task(callback.message.reply_markup, task_id))
        except Exception as exc:  # the message may be too old to edit; the task itself is already updated
            logger.info("Organizer task buttons not updated: %s", exc)
