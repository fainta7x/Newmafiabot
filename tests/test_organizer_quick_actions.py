import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

import handlers.organizer_quick_actions as quick
from organizer_notifications import build_organizer_digest_keyboard


class OrganizerQuickActionsTest(unittest.TestCase):
    def test_each_task_gets_done_and_tomorrow_buttons(self):
        rows = quick.task_button_rows([
            {"id": "t-1", "title": "Позвонить новичку после первого вечера"},
            {"id": "t-2", "title": "Купить призы"},
        ])
        self.assertEqual([[b.callback_data for b in row] for row in rows], [
            ["otask:done:t-1", "otask:snooze:t-1"],
            ["otask:done:t-2", "otask:snooze:t-2"],
        ])
        self.assertEqual(rows[0][0].text, "✅ Позвонить новичку после…")
        self.assertEqual(rows[1][1].text, "⏰ Завтра")

    def test_every_task_listed_in_the_digest_gets_buttons(self):
        keyboard = build_organizer_digest_keyboard({"tasks": [{"id": f"t-{i}", "title": f"Задача {i}"} for i in range(10)]})
        task_rows = [row for row in keyboard.inline_keyboard if (row[0].callback_data or "").startswith("otask:")]
        self.assertEqual(len(task_rows), 10)

    def test_task_id_over_telegram_limit_gets_no_buttons(self):
        self.assertEqual(quick.task_button_rows([{"id": "x" * 60, "title": "Длинный id"}]), [])

    def test_digest_keyboard_has_tasks_and_crm(self):
        keyboard = build_organizer_digest_keyboard({"tasks": [{"id": "t-1", "title": "Задача"}]})
        self.assertIsNotNone(keyboard)
        self.assertEqual(keyboard.inline_keyboard[0][0].callback_data, "otask:done:t-1")
        self.assertEqual(keyboard.inline_keyboard[-1][0].text, "📋 Открыть CRM")

    def _callback(self, data: str):
        markup = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="✅ A", callback_data="otask:done:t-1"), InlineKeyboardButton(text="⏰", callback_data="otask:snooze:t-1")],
            [InlineKeyboardButton(text="✅ B", callback_data="otask:done:t-2"), InlineKeyboardButton(text="⏰", callback_data="otask:snooze:t-2")],
        ])
        message = SimpleNamespace(reply_markup=markup, edit_reply_markup=AsyncMock())
        return SimpleNamespace(data=data, from_user=SimpleNamespace(id=42), message=message, answer=AsyncMock())

    def test_done_closes_the_task_and_removes_only_its_row(self):
        callback = self._callback("otask:done:t-1")
        api = AsyncMock(return_value={"success": True, "data": {"id": "t-1", "title": "A", "status": "done"}})
        with patch.object(quick, "apply_organizer_task_action", api):
            asyncio.run(quick.handle_organizer_task_action(callback))
        api.assert_awaited_once_with("t-1", "done", 42)
        callback.answer.assert_awaited_once_with("✅ Сделано: A")
        markup = callback.message.edit_reply_markup.await_args.kwargs["reply_markup"]
        self.assertEqual([[b.callback_data for b in row] for row in markup.inline_keyboard], [["otask:done:t-2", "otask:snooze:t-2"]])

    def test_not_an_organizer_gets_an_alert_and_nothing_changes(self):
        callback = self._callback("otask:snooze:t-1")
        api = AsyncMock(return_value={"success": False, "error": "authorization"})
        with patch.object(quick, "apply_organizer_task_action", api):
            asyncio.run(quick.handle_organizer_task_action(callback))
        callback.answer.assert_awaited_once_with("Это действие доступно только организаторам.", show_alert=True)
        callback.message.edit_reply_markup.assert_not_awaited()


    def test_first_game_time_answer_saves_and_drops_the_buttons(self):
        callback = self._callback("estart:ev-1:2000")
        callback.message.reply = AsyncMock()
        api = AsyncMock(return_value={"success": True, "data": {"announcement_due": False}})
        with patch.object(quick, "confirm_evening_first_game_start", api):
            asyncio.run(quick.handle_evening_first_game_start(callback))
        api.assert_awaited_once_with("ev-1", "20:00", 42)
        callback.answer.assert_awaited_once_with("Первая игра в 20:00, анонс уйдёт в понедельник в 19:00.")
        self.assertIsNone(callback.message.edit_reply_markup.await_args.kwargs["reply_markup"])

    def test_first_game_time_after_the_announcement_points_to_the_crm(self):
        callback = self._callback("estart:ev-1:2000")
        with patch.object(quick, "confirm_evening_first_game_start", AsyncMock(return_value={"success": False, "error": "closed"})):
            asyncio.run(quick.handle_evening_first_game_start(callback))
        self.assertIn("Анонс уже ушёл", callback.answer.await_args.args[0])


if __name__ == "__main__":
    unittest.main()
