import asyncio
import types

import handlers.crm_evening_response as responses

EVENING = "11111111-2222-3333-4444-555555555555"
SLOTS = {"success": True, "data": {"slots": [
    {"id": "s1", "slot_number": 1, "starts_at": "2026-10-16T18:00:00Z"},
    {"id": "s2", "slot_number": 2, "starts_at": "2026-10-16T19:00:00Z"},
]}}


class FakeMessage:
    def __init__(self, chat_type):
        self.chat = types.SimpleNamespace(type=chat_type)
        self.answered = []

    async def answer(self, text, **kwargs):
        self.answered.append(text)


class FakeCallback:
    def __init__(self, chat_type):
        self.data = f"evr:{EVENING}:late"
        self.from_user = types.SimpleNamespace(id=501)
        self.message = FakeMessage(chat_type)
        self.answers = []

    async def answer(self, text=None, show_alert=False):
        self.answers.append((text, show_alert))


class FakeBot:
    def __init__(self, fail=False):
        self.sent = []
        self.fail = fail

    async def send_message(self, chat_id, text, **kwargs):
        if self.fail:
            raise RuntimeError("Forbidden: bot can't initiate conversation with a user")
        self.sent.append((chat_id, text, kwargs.get("reply_markup")))


def _run(monkeypatch, chat_type, fail=False):
    async def slots(evening_id):
        return SLOTS

    monkeypatch.setattr(responses, "get_evening_slots", slots)
    callback = FakeCallback(chat_type)
    bot = FakeBot(fail=fail)
    asyncio.run(responses.handle_crm_evening_response(callback, bot))
    return callback, bot


def test_in_a_group_the_game_picker_goes_to_the_player_privately_not_to_the_chat(monkeypatch):
    callback, bot = _run(monkeypatch, "supergroup")
    assert callback.message.answered == []
    assert len(bot.sent) == 1 and bot.sent[0][0] == 501
    assert "С какой игры тебя ждать?" in bot.sent[0][1]
    buttons = [button for row in bot.sent[0][2].inline_keyboard for button in row]
    assert [button.callback_data for button in buttons] == [f"evlate:{EVENING}:1", f"evlate:{EVENING}:2"]
    assert callback.answers and callback.answers[0][1] is False


def test_if_the_bot_cannot_write_privately_the_player_is_told_to_open_it_and_the_chat_stays_clean(monkeypatch):
    callback, bot = _run(monkeypatch, "group", fail=True)
    assert callback.message.answered == []
    assert bot.sent == []
    assert callback.answers[0][1] is True
    assert "Старт" in callback.answers[0][0]


def test_in_the_private_chat_the_picker_still_appears_under_the_message(monkeypatch):
    callback, bot = _run(monkeypatch, "private")
    assert len(callback.message.answered) == 1
    assert bot.sent == []
