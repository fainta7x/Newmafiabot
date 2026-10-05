import asyncio
import types

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

import handlers.crm_evening_response as responses

EVENING = "11111111-2222-3333-4444-555555555555"


def _keyboard():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="Бета", callback_data=f"evv:{EVENING}:bbbb2222"),
         InlineKeyboardButton(text="Гамма", callback_data=f"evv:{EVENING}:cccc3333")],
        [InlineKeyboardButton(text="Эпсилон", callback_data=f"evv:{EVENING}:eeee5555")],
    ])


class FakeMessage:
    def __init__(self, markup):
        self.reply_markup = markup
        self.edited = []

    async def edit_reply_markup(self, reply_markup=None):
        self.edited.append(reply_markup)
        self.reply_markup = reply_markup


class FakeCallback:
    def __init__(self, data, markup=None):
        self.data = data
        self.from_user = types.SimpleNamespace(id=501)
        self.message = FakeMessage(markup or _keyboard())
        self.answers = []

    async def answer(self, text=None, show_alert=False):
        self.answers.append((text, show_alert))


def _texts(markup):
    return [button.text for row in markup.inline_keyboard for button in row]


def test_mark_puts_the_check_on_the_chosen_player_only():
    marked = responses._mark_vote_choice(_keyboard(), f"evv:{EVENING}:cccc3333")
    assert _texts(marked) == ["Бета", "✅ Гамма", "Эпсилон"]
    # choosing another player moves the mark
    moved = responses._mark_vote_choice(marked, f"evv:{EVENING}:bbbb2222")
    assert _texts(moved) == ["✅ Бета", "Гамма", "Эпсилон"]
    # the callback data of every button is kept
    assert [b.callback_data for row in moved.inline_keyboard for b in row] == [f"evv:{EVENING}:{x}" for x in ("bbbb2222", "cccc3333", "eeee5555")]
    assert responses._mark_vote_choice(None, "x") is None


def test_a_tap_records_the_vote_and_marks_the_choice(monkeypatch):
    calls = []

    async def vote(evening_id, telegram_user_id, nominee):
        calls.append((evening_id, telegram_user_id, nominee))
        return {"success": True, "data": {"nominee": "Гамма"}}

    monkeypatch.setattr(responses, "cast_evening_vote", vote)
    callback = FakeCallback(f"evv:{EVENING}:cccc3333")
    asyncio.run(responses.handle_evening_vote(callback))
    assert calls == [(EVENING, 501, "cccc3333")]
    assert callback.answers == [("✅ Твой голос: Гамма", False)]
    assert _texts(callback.message.reply_markup) == ["Бета", "✅ Гамма", "Эпсилон"]


def test_a_refusal_is_shown_and_the_keyboard_is_left_alone(monkeypatch):
    async def vote(evening_id, telegram_user_id, nominee):
        return {"success": False, "error": "closed"}

    monkeypatch.setattr(responses, "cast_evening_vote", vote)
    callback = FakeCallback(f"evv:{EVENING}:cccc3333")
    asyncio.run(responses.handle_evening_vote(callback))
    assert callback.answers == [("Голосование по этому вечеру уже закрыто.", True)]
    assert callback.message.edited == []


def test_a_broken_button_is_refused_without_calling_the_server(monkeypatch):
    async def vote(*args):
        raise AssertionError("the server must not be called")

    monkeypatch.setattr(responses, "cast_evening_vote", vote)
    callback = FakeCallback("evv:only-one-part")
    asyncio.run(responses.handle_evening_vote(callback))
    assert callback.answers == [("Некорректная кнопка", True)]
