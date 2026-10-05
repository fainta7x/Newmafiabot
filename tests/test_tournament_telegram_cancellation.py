import asyncio
import types

import handlers.crm_tournament_publishing as tournament_publishing


class FakeBot:
    def __init__(self):
        self.sent = []
        self.edited = []
        self._next_id = 500

    async def send_message(self, **kwargs):
        self._next_id += 1
        self.sent.append(kwargs)
        return types.SimpleNamespace(message_id=self._next_id)

    async def edit_message_text(self, **kwargs):
        self.edited.append(kwargs)


def _install_plan(monkeypatch, status, cancel_notice_message_id=None):
    saved = []

    async def plan(tournament_id):
        return {"success": True, "data": {
            "tournament": {"id": tournament_id, "status": status, "title": "Осенний кубок", "date": "2026-10-10T16:00:00.000Z"},
            "participants": [],
            "destinations": [{"id": "rating", "active": True, "chat_id": "-300"}],
            "desired_destination_ids": [] if status in ("cancelled", "completed") else ["rating"],
            "publications": [{
                "destination_id": "rating", "chat_id": "-300", "message_id": 77,
                "cancel_notice_message_id": cancel_notice_message_id,
            }],
        }}

    async def save_notice(tournament_id, destination_id, message_id):
        saved.append((tournament_id, destination_id, message_id))
        return {"success": True}

    monkeypatch.setattr(tournament_publishing, "get_tournament_telegram_plan", plan)
    monkeypatch.setattr(tournament_publishing, "save_tournament_cancel_notice", save_notice)
    return saved


def test_date_is_shown_in_club_time_not_utc():
    # 16:00 UTC is 19:00 in Moscow
    assert tournament_publishing._format_date("2026-10-10T16:00:00.000Z") == "10.10.2026 · 19:00"
    assert tournament_publishing._format_date("not a date") == "not a date"


def test_cancelled_tournament_keeps_its_announcement_and_gets_one_new_notice(monkeypatch):
    saved = _install_plan(monkeypatch, "cancelled")
    bot = FakeBot()
    result = asyncio.run(tournament_publishing.sync_tournament_telegram(bot, "t1"))
    assert result["success"] is True
    assert bot.edited == []
    assert len(bot.sent) == 1 and "Турнир отменён" in bot.sent[0]["text"] and "19:00" in bot.sent[0]["text"]
    assert saved == [("t1", "rating", 501)]


def test_cancellation_notice_is_not_repeated(monkeypatch):
    saved = _install_plan(monkeypatch, "cancelled", cancel_notice_message_id=900)
    bot = FakeBot()
    result = asyncio.run(tournament_publishing.sync_tournament_telegram(bot, "t1"))
    assert result["success"] is True
    assert bot.sent == [] and bot.edited == [] and saved == []
