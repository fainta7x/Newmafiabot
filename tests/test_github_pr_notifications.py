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
        self.assertIn("деплой", text)

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


class PrMarksTests(unittest.TestCase):
    def test_author_is_told_by_branch_or_footer(self):
        self.assertEqual(mod.author({"head": {"ref": "claude/busy-euler-bogxha"}, "body": ""}), "🤖 Claude")
        self.assertEqual(mod.author({"head": {"ref": "feat/x"}, "body": "text\n🤖 Generated with [Claude Code](https://claude.com/claude-code)"}), "🤖 Claude")
        self.assertEqual(mod.author({"head": {"ref": "fix/player-first-application-focus"}, "body": "Fix confirmed defect"}), "💬 GPT")
        self.assertEqual(mod.author({"head": None, "body": None}), "💬 GPT")

    def test_status_uses_one_colour_language(self):
        open_pr = {"number": 1, "title": "T", "state": "open", "merged_at": None}
        passed = [{"name": name, "status": "completed", "conclusion": "success"} for name in mod.CHECKS]
        running = [{"name": mod.CHECKS[0], "status": "in_progress", "conclusion": None}]
        self.assertEqual(mod.status({**open_pr, "state": "closed", "merged_at": "2026-10-12T12:00:00Z"}, [])[1], "🟢 Слито в main")
        self.assertEqual(mod.status(open_pr, running)[1], "🟡 В проверке")
        # Passed checks are NOT «done»: the line says it is not merged yet and is not green.
        ready = mod.status(open_pr, passed)[1]
        self.assertTrue(ready.startswith("🔵"))
        self.assertIn("ещё не слито", ready)
        failed = [{"name": mod.CHECKS[0], "status": "completed", "conclusion": "failure"}]
        self.assertTrue(mod.status(open_pr, failed)[1].startswith("🔴"))


class PrNotificationIntegrationTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        mod._pulls_etag = None

    async def _run(self, pulls_sequence, checks=None):
        """Feeds the poller successive PR lists and returns the bot mock and the final state."""
        bot = AsyncMock()
        sequence = iter(pulls_sequence)

        def fake_fetch(path, etag=None):
            if path.startswith("/pulls?"):
                return next(sequence), "etag"
            return (checks or {"check_runs": []}), None

        with tempfile.TemporaryDirectory() as temp:
            with patch.object(mod, "STATE", Path(temp) / "state.json"), patch.object(mod, "fetch", side_effect=fake_fetch):
                for _ in pulls_sequence:
                    await mod.tick(bot, [123])
                data = json.loads(mod.STATE.read_text(encoding="utf-8"))
        return bot, data

    def pr(self, number=44, state="open", merged_at=None, closed_at=None):
        return {"number": number, "title": "Some feature", "body": "- Feature change description",
                "state": state, "merged_at": merged_at, "closed_at": closed_at, "head": {"sha": "abc"}}

    async def test_first_poll_is_silent_then_new_pr_is_announced_at_once(self):
        bot, data = await self._run([[self.pr(1)], [self.pr(2), self.pr(1)]])
        self.assertEqual(bot.send_message.await_count, 1)
        self.assertIn("Открыт новый PR", bot.send_message.await_args.args[1])
        self.assertIn("в проверке", bot.send_message.await_args.args[1])
        self.assertEqual(data, {"1": "open", "2": "open"})

    async def test_merge_and_close_are_announced_once_each(self):
        merged = self.pr(1, "closed", merged_at="2026-10-12T12:00:00Z")
        closed = self.pr(2, "closed", closed_at="2026-10-12T12:00:00Z")
        bot, data = await self._run([[self.pr(1), self.pr(2)], [merged, closed], [merged, closed]])
        self.assertEqual(bot.send_message.await_count, 2)
        texts = [call.args[1] for call in bot.send_message.await_args_list]
        self.assertTrue(any("Слито в main" in t for t in texts))
        self.assertTrue(any("Закрыто без слияния" in t for t in texts))
        self.assertEqual(data, {"1": "merged", "2": "closed"})

    async def test_pr_opened_and_merged_between_two_polls_is_not_lost(self):
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).isoformat()
        bot, _ = await self._run([[self.pr(1)], [self.pr(9, "closed", merged_at=now), self.pr(1)]])
        self.assertEqual(bot.send_message.await_count, 1)
        self.assertIn("Слито в main", bot.send_message.await_args.args[1])

    async def test_old_closed_pr_never_seen_is_not_announced(self):
        bot, data = await self._run([[self.pr(1)], [self.pr(7, "closed", merged_at="2026-01-01T00:00:00Z"), self.pr(1)]])
        self.assertEqual(bot.send_message.await_count, 0)
        self.assertEqual(data["7"], "merged")

    async def test_unchanged_poll_does_nothing(self):
        bot = AsyncMock()
        with tempfile.TemporaryDirectory() as temp:
            with patch.object(mod, "STATE", Path(temp) / "state.json"), patch.object(mod, "fetch", return_value=(None, "etag")):
                await mod.tick(bot, [123])
                self.assertFalse(mod.STATE.exists())
        self.assertEqual(bot.send_message.await_count, 0)

    async def test_legacy_pending_state_does_not_resend_for_an_open_pr(self):
        bot = AsyncMock()
        with tempfile.TemporaryDirectory() as temp:
            state = Path(temp) / "state.json"
            state.write_text(json.dumps({"5": "pending", "6": "ready"}), encoding="utf-8")
            with patch.object(mod, "STATE", state), patch.object(mod, "fetch", return_value=([self.pr(5), self.pr(6)], "e")):
                await mod.tick(bot, [123])
            self.assertEqual(json.loads(state.read_text(encoding="utf-8")), {"5": "open", "6": "open"})
        self.assertEqual(bot.send_message.await_count, 0)

    async def test_overview_separates_open_from_merged_and_marks_whose(self):
        merged = {**self.pr(7, "closed", merged_at="2026-10-12T11:00:00Z"), "head": {"sha": "m", "ref": "claude/busy-euler-bogxha"}, "body": ""}
        opened = {**self.pr(8), "head": {"sha": "o", "ref": "feat/gomafia"}}
        passed = {"check_runs": [{"name": name, "status": "completed", "conclusion": "success"} for name in mod.CHECKS]}

        def fake_github(path):
            return [opened, merged] if path.startswith("/pulls?") else passed

        with patch.object(mod, "github", side_effect=fake_github):
            text = await mod.overview()
        self.assertLess(text.index("PR клуба"), text.index("Недавно слито"))
        self.assertIn("🔵 <a href=", text)
        self.assertIn("· 💬 GPT", text)
        self.assertIn("🟢 <a href=", text)
        self.assertIn("· 🤖 Claude", text)

    async def test_overview_shows_open_prs_with_check_progress(self):
        checks = {"check_runs": [{"name": "Release gate", "status": "in_progress", "conclusion": None}]}

        def fake_github(path):
            return [self.pr(11)] if path.startswith("/pulls?") else checks

        with patch.object(mod, "github", side_effect=fake_github):
            text = await mod.overview()
        self.assertIn("#11", text)
        self.assertIn("🟡 <a href=", text)
        self.assertIn("деплой", text)
        self.assertIn("в работе", text)  # the legend explains the colours
        self.assertIn("💬 GPT", text)  # no claude/ branch and no footer


if __name__ == "__main__":
    unittest.main()
