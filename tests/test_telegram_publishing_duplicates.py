import asyncio
import types

from aiogram.exceptions import TelegramBadRequest, TelegramNetworkError

import handlers.crm_telegram_publishing as publishing


class FakeBot:
    def __init__(self, edit_error=None):
        self.sent = []
        self.deleted = []
        self.pinned = []
        self.edit_error = edit_error
        self._next_id = 100

    async def get_me(self):
        return types.SimpleNamespace(username="noire_bot")

    async def send_message(self, **kwargs):
        await asyncio.sleep(0.01)
        self._next_id += 1
        self.sent.append(kwargs)
        return types.SimpleNamespace(message_id=self._next_id)

    async def edit_message_text(self, **kwargs):
        if self.edit_error:
            raise self.edit_error

    async def delete_message(self, chat_id, message_id):
        self.deleted.append(message_id)

    async def pin_chat_message(self, **kwargs):
        self.pinned.append(kwargs)


def _router_payload(message_id):
    async def payload():
        return {"success": True, "data": {"public_destination": {"active": True, "chat_id": "-100", "router_message_id": message_id}}}
    return payload


def test_router_is_not_reposted_after_a_temporary_edit_error(monkeypatch):
    bot = FakeBot(edit_error=TelegramNetworkError(method=None, message="timeout"))
    monkeypatch.setattr(publishing, "get_public_router_payload", _router_payload(55))
    result = asyncio.run(publishing.sync_public_router(bot))
    assert result["success"] is False
    assert bot.sent == [] and bot.pinned == []


def test_router_is_recreated_only_when_the_old_message_is_gone(monkeypatch):
    bot = FakeBot(edit_error=TelegramBadRequest(method=None, message="Bad Request: message to edit not found"))
    monkeypatch.setattr(publishing, "get_public_router_payload", _router_payload(55))

    async def saved(message_id):
        return {"success": True}
    monkeypatch.setattr(publishing, "save_public_router_message_id", saved)
    result = asyncio.run(publishing.sync_public_router(bot))
    assert result["action"] == "created"
    assert len(bot.sent) == 1 and len(bot.pinned) == 1


def _install_plan(monkeypatch, store):
    async def plan(evening_id):
        publications = [{"destination_id": "club", "chat_id": "-200", "message_id": store["message_id"]}] if store.get("message_id") else []
        return {"success": True, "data": {
            "evening": {"id": evening_id, "status": "published", "title": "Пятница", "starts_at": "2026-10-02T16:00:00Z"},
            "slots": [], "participants": [],
            "destinations": [{"id": "club", "active": True, "chat_id": "-200"}],
            "publications": publications,
            "desired_destination_ids": ["club"],
        }}
    monkeypatch.setattr(publishing, "get_evening_telegram_plan", plan)
    monkeypatch.setattr(publishing, "thematic_event_text", lambda *args: "Анонс")


def test_parallel_runs_publish_one_post(monkeypatch):
    store = {}
    _install_plan(monkeypatch, store)

    async def save(evening_id, destination_id, chat_id, topic_id, message_id):
        store["message_id"] = message_id
        return {"success": True}
    monkeypatch.setattr(publishing, "save_evening_telegram_publication", save)
    bot = FakeBot()

    async def both():
        return await asyncio.gather(
            publishing.sync_evening_telegram(bot, "ev1", refresh_router=False),
            publishing.sync_evening_telegram(bot, "ev1", refresh_router=False),
        )
    asyncio.run(both())
    assert len(bot.sent) == 1


def test_unsaved_post_is_removed_so_a_retry_does_not_duplicate_it(monkeypatch):
    _install_plan(monkeypatch, {})

    async def failing_save(*args):
        return {"success": False, "error": "timeout"}
    monkeypatch.setattr(publishing, "save_evening_telegram_publication", failing_save)

    async def no_sleep(_):
        return None
    monkeypatch.setattr(publishing.asyncio, "sleep", no_sleep)
    bot = FakeBot()
    result = asyncio.run(publishing.sync_evening_telegram(bot, "ev2", refresh_router=False))
    assert result["success"] is False
    assert bot.deleted == [101]
