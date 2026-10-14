import asyncio
import types

import handlers.registration as registration


class FakeState:
    async def get_data(self):
        return {}

    async def clear(self):
        pass


class FakeMessage:
    def __init__(self, text):
        self.text = text
        self.from_user = types.SimpleNamespace(id=7, username="u", full_name="Игрок")
        self.answers = []

    async def answer(self, text, **kwargs):
        self.answers.append(text)


def _run(monkeypatch, result, nickname="Атеист с ножом"):
    async def fake(**kwargs):
        return result

    monkeypatch.setattr(registration, "register_canonical_profile", fake)
    message = FakeMessage(nickname)
    asyncio.run(registration.finish_registration(message, FakeState()))
    return message.answers


def test_a_vk_profile_gets_the_connect_telegram_instruction(monkeypatch):
    answers = _run(monkeypatch, {"success": False, "error": "nickname_taken", "data": {"claimable": False, "vk_only": True}})
    assert len(answers) == 1
    assert "через ВКонтакте" in answers[0]
    assert "Связать Telegram" in answers[0]
    assert "уже занят" not in answers[0]


def test_a_profile_with_its_own_telegram_is_still_simply_taken(monkeypatch):
    answers = _run(monkeypatch, {"success": False, "error": "nickname_taken", "data": {"claimable": False}})
    assert len(answers) == 1
    assert "уже занят игроком со своим аккаунтом" in answers[0]
