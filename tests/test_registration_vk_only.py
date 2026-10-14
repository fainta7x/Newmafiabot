import asyncio
import types

import handlers.registration as registration


class FakeState:
    def __init__(self):
        self.data = {}

    async def get_data(self):
        return {}

    async def clear(self):
        pass

    async def set_state(self, value):
        pass

    async def update_data(self, **kwargs):
        self.data.update(kwargs)


class FakeMessage:
    def __init__(self, text):
        self.text = text
        self.from_user = types.SimpleNamespace(id=7, username="u", full_name="Игрок")
        self.answers = []
        self.markups = []

    async def answer(self, text, **kwargs):
        self.answers.append(text)
        self.markups.append(kwargs.get("reply_markup"))


def _run(monkeypatch, result, link=None, nickname="Атеист с ножом"):
    async def fake(**kwargs):
        return result

    async def fake_link(telegram_user_id):
        return link or {"success": False, "error": "unavailable"}

    monkeypatch.setattr(registration, "register_canonical_profile", fake)
    monkeypatch.setattr(registration, "create_telegram_link_request", fake_link)
    message = FakeMessage(nickname)
    state = FakeState()
    asyncio.run(registration.finish_registration(message, state))
    return message, state


def _buttons(markup):
    return [button for row in markup.inline_keyboard for button in row]


def test_a_vk_profile_offers_vk_id_confirmation_and_an_organizer_request(monkeypatch):
    message, state = _run(
        monkeypatch,
        {"success": False, "error": "nickname_taken", "data": {"claimable": False, "vk_only": True}},
        link={"success": True, "data": {"url": "https://app.example/player?tglink=abc"}},
    )
    assert len(message.answers) == 1
    assert "через ВКонтакте" in message.answers[0]
    buttons = _buttons(message.markups[0])
    assert any(button.url == "https://app.example/player?tglink=abc" for button in buttons)
    assert any(button.callback_data == "profile_claim:yes" for button in buttons)
    assert any(button.callback_data == "profile_claim:no" for button in buttons)
    assert state.data == {"taken_nickname": "Атеист с ножом"}


def test_without_a_link_the_organizer_request_is_still_offered(monkeypatch):
    message, _ = _run(monkeypatch, {"success": False, "error": "nickname_taken", "data": {"claimable": False, "vk_only": True}})
    buttons = _buttons(message.markups[0])
    assert not any(button.url for button in buttons)
    assert any(button.callback_data == "profile_claim:yes" for button in buttons)


def test_a_profile_with_its_own_telegram_is_still_simply_taken(monkeypatch):
    message, _ = _run(monkeypatch, {"success": False, "error": "nickname_taken", "data": {"claimable": False}})
    assert len(message.answers) == 1
    assert "уже занят игроком со своим аккаунтом" in message.answers[0]
