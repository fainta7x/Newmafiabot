import asyncio
import importlib
import json
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch


def _install_aiogram_stubs():
    if "aiogram" in sys.modules:
        return

    class _Filter:
        def __eq__(self, _other): return self
        def startswith(self, _value): return self

    class _F:
        data = _Filter()

    class _Router:
        def callback_query(self, *_args, **_kwargs):
            def decorator(func):
                return func
            return decorator

    class _Builder:
        def __init__(self):
            self.buttons = []
        def button(self, **kwargs):
            self.buttons.append(kwargs)
        def adjust(self, *_args):
            pass
        def as_markup(self):
            return types.SimpleNamespace(buttons=self.buttons)

    aiogram = types.ModuleType("aiogram")
    aiogram.F = _F()
    aiogram.Router = _Router

    enums = types.ModuleType("aiogram.enums")
    enums.ParseMode = types.SimpleNamespace(HTML="HTML")

    types_mod = types.ModuleType("aiogram.types")
    types_mod.CallbackQuery = object

    keyboard = types.ModuleType("aiogram.utils.keyboard")
    keyboard.InlineKeyboardBuilder = _Builder
    keyboard.InlineKeyboardMarkup = object

    sys.modules["aiogram"] = aiogram
    sys.modules["aiogram.enums"] = enums
    sys.modules["aiogram.types"] = types_mod
    sys.modules["aiogram.utils"] = types.ModuleType("aiogram.utils")
    sys.modules["aiogram.utils.keyboard"] = keyboard


class _FakeResponse:
    def __init__(self, status, payload=None, json_error=None):
        self.status = status
        self.payload = payload
        self.json_error = json_error
    async def __aenter__(self):
        return self
    async def __aexit__(self, *_args):
        return False
    async def json(self):
        if self.json_error:
            raise self.json_error
        return self.payload


class _FakeSession:
    def __init__(self, response=None, get_error=None, **_kwargs):
        self.response = response
        self.get_error = get_error
        self.last_url = None
        self.last_headers = None
    async def __aenter__(self):
        return self
    async def __aexit__(self, *_args):
        return False
    def get(self, url, headers):
        self.last_url = url
        self.last_headers = headers
        if self.get_error:
            raise self.get_error
        return self.response


SAMPLE = {
    "player": {"id": "p1", "nickname": "Alice", "telegram_user_id": "123"},
    "achievements": {
        "earned": 1,
        "total": 40,
        "percentage": 3,
        "categories": [
            {
                "id": "wins", "name": "🏆 Победные", "icon": "🏆", "order": 2,
                "earned": 0, "total": 1, "percentage": 0,
                "achievements": [{
                    "id": "ten_wins", "name": "Ten <Wins>", "description": "Win & grow",
                    "icon": "🏆", "rarity": "rare", "rarity_name": "Редкая",
                    "rarity_icon": "🔵", "earned": False, "earned_at": None,
                    "progress": {"current": 7, "target": 10},
                }],
            },
            {
                "id": "games", "name": "🎮 Игровые", "icon": "🎮", "order": 1,
                "earned": 1, "total": 1, "percentage": 100,
                "achievements": [{
                    "id": "first_game", "name": "First", "description": "Play once",
                    "icon": "🎭", "rarity": "common", "rarity_name": "Обычная",
                    "rarity_icon": "⚪", "earned": True,
                    "earned_at": "2026-08-09T12:00:00.000Z",
                    "progress": {"current": 7, "target": 1},
                }],
            },
        ],
    },
}


class BotApiTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        config = types.ModuleType("config")
        config.BOT_API_BASE_URL = "https://backend.example"
        config.BOT_API_SECRET = "secret-value"
        sys.modules["config"] = config
        base = Path(__file__).resolve().parents[1]
        sys.path.insert(0, str(base))
        cls.bot_api = importlib.import_module("bot_api")

    async def _call(self, response=None, get_error=None):
        session = _FakeSession(response=response, get_error=get_error)
        with patch.object(self.bot_api.aiohttp, "ClientSession", return_value=session):
            result = await self.bot_api.get_achievement_profile_by_telegram(123)
        return result, session

    async def test_api_success_and_telegram_id_route(self):
        result, session = await self._call(_FakeResponse(200, SAMPLE))
        self.assertTrue(result["success"])
        self.assertTrue(session.last_url.endswith("/api/bot/players/by-telegram/123/achievements"))
        self.assertEqual(session.last_headers["X-Bot-Token"], "secret-value")

    async def test_unknown_player(self):
        result, _ = await self._call(_FakeResponse(404, {"error": "Игрок не найден"}))
        self.assertEqual(result["error"], "not_found")

    async def test_401_and_503(self):
        result, _ = await self._call(_FakeResponse(401, {}))
        self.assertEqual(result["error"], "authorization")
        result, _ = await self._call(_FakeResponse(503, {}))
        self.assertEqual(result["error"], "unavailable")

    async def test_timeout(self):
        result, _ = await self._call(get_error=asyncio.TimeoutError())
        self.assertEqual(result["error"], "timeout")

    async def test_malformed_json(self):
        result, _ = await self._call(_FakeResponse(200, json_error=json.JSONDecodeError("bad", "", 0)))
        self.assertEqual(result["error"], "malformed")


class HandlerTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        _install_aiogram_stubs()
        if "bot_api" not in sys.modules:
            config = types.ModuleType("config")
            config.BOT_API_BASE_URL = "https://backend.example"
            config.BOT_API_SECRET = "secret-value"
            sys.modules["config"] = config
            importlib.import_module("bot_api")
        cls.module = importlib.import_module("handlers.achievements")

    def test_category_order_and_rendering(self):
        profile = SAMPLE["achievements"]
        ordered = self.module._sorted_categories(profile)
        self.assertEqual([c["id"] for c in ordered], ["games", "wins"])
        text = self.module.render_category(profile, "wins")
        self.assertIn("🔒 Закрыто", text)
        self.assertIn("7 / 10", text)
        self.assertIn("Ten &lt;Wins&gt;", text)
        earned_text = self.module.render_category(profile, "games")
        self.assertIn("✅ Получено", earned_text)
        self.assertIn("09.08.2026", earned_text)

    async def test_callback_is_acknowledged_on_success(self):
        callback = types.SimpleNamespace(
            from_user=types.SimpleNamespace(id=123),
            data="ach_menu",
            message=types.SimpleNamespace(edit_text=AsyncMock()),
            answer=AsyncMock(),
        )
        with patch.object(
            self.module,
            "get_achievement_profile_by_telegram",
            new=AsyncMock(return_value={"success": True, "data": SAMPLE}),
        ):
            await self.module.back_to_achievements_menu(callback)
        callback.answer.assert_awaited_once()

    async def test_callback_is_acknowledged_on_failure(self):
        callback = types.SimpleNamespace(
            from_user=types.SimpleNamespace(id=999),
            data="ach_menu",
            message=types.SimpleNamespace(edit_text=AsyncMock()),
            answer=AsyncMock(),
        )
        with patch.object(
            self.module,
            "get_achievement_profile_by_telegram",
            new=AsyncMock(return_value={"success": False, "error": "not_found"}),
        ):
            await self.module.back_to_achievements_menu(callback)
        callback.answer.assert_awaited_once()
        args = callback.message.edit_text.await_args.args
        self.assertIn("не привязан", args[0])


if __name__ == "__main__":
    unittest.main()
