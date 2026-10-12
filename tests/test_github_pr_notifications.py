"""Offline verification of GitHub PR notices sent via the existing Telegram bot."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

import github_pr_notifications as mod


class PrNotificationTests(unittest.TestCase):
    def test_merge_not_reported_as_deployed(self):
        pr = {"number": 15, "title": "Answers & <players>", "body": "- Joined all response panels",
              "merged_at": "2026-10-12T12:00:00Z", "state": "closed"}
        status, label = mod.status(pr, [])
        text = mod.message(pr, label, [], [])
        self.assertEqual(status, "merged")
        self.assertIn("&lt;players&gt;", text)
        self.assertIn("Amvera", text)

    def test_failed_check_blocks_ready(self):
        pr = {"number": 15, "title": "Answers", "state": "open", "merged_at": None}
        checks = [{"name": name, "status": "completed",
                   "conclusion": "failure" if name == "Release gate" else "success"}
                  for name in mod.CHECKS]
        self.assertEqual(mod.status(pr, checks)[0], "failed")

    def test_pending_codeql_is_not_ready(self):
        pr = {"number": 15, "title": "Answers", "state": "open", "merged_at": None}
        checks = [{"name": name, "status": "completed", "conclusion": "success"}
                  for name in mod.CHECKS[:-1]]
        self.assertEqual(mod.status(pr, checks)[0], "pending")


class PrNotificationIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def test_initial_sync_does_not_send_history_and_merge_sends_once(self):
        pr = {"number": 44, "title": "Some feature", "body": "- Feature change description",
              "state": "open", "merged_at": None, "head": {"sha": "abc"}}
        checks = {"check_runs": []}
        bot = AsyncMock()
        with tempfile.TemporaryDirectory() as temp:
            with patch.object(mod, "STATE", Path(temp) / "state.json"), \
                 patch.object(mod, "github", side_effect=lambda path: [pr] if path.startswith("/pulls?") else checks):
                await mod.tick(bot, [123])
                self.assertEqual(bot.send_message.await_count, 0)
                pr["state"] = "closed"
                pr["merged_at"] = "2026-10-12T12:00:00Z"
                await mod.tick(bot, [123])
                self.assertEqual(bot.send_message.await_count, 1)
                await mod.tick(bot, [123])
                self.assertEqual(bot.send_message.await_count, 1)
                data = json.loads(mod.STATE.read_text(encoding="utf-8"))
                self.assertEqual(data["44"], "merged")


if __name__ == "__main__":
    unittest.main()
