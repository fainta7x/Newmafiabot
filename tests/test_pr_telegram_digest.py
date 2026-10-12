"""Focused, offline regressions for Telegram PR notification formatting."""
import unittest
from unittest.mock import patch

from scripts import telegram_pr_digest as digest


class TelegramPrDigestTests(unittest.TestCase):
    def test_escapes_pr_content_and_shows_merged_state(self):
        pr = {
            "number": 123,
            "title": "Fix <broken> & UI",
            "body": "- Добавили <опасный> текст в описание",
            "state": "closed",
            "merged": True,
            "head": {"sha": "abc"},
        }
        with patch.object(digest, "check_summary", return_value=(["• CI: ✅ пройдена"], False, True)), \
             patch.object(digest, "recent_merges", return_value=[]):
            message = digest.prepare_message("owner/repo", pr, "pull_request_target", {})
        self.assertIn("✅ СЛИТО", message)
        self.assertIn("&lt;broken&gt; &amp;", message)
        self.assertIn("&lt;опасный&gt;", message)
        self.assertIn("ещё не подтверждает деплой", message)

    def test_ci_failure_does_not_claim_merge(self):
        pr = {"number": 5, "title": "Work", "state": "open", "head": {"sha": "abc"}}
        with patch.object(digest, "check_summary", return_value=(["• CI: ❌ failure"], True, False)), \
             patch.object(digest, "recent_merges", return_value=[]):
            message = digest.prepare_message(
                "owner/repo", pr, "workflow_run", {"workflow_run": {"conclusion": "failure"}}
            )
        self.assertIn("❌ CI завершился ошибкой", message)
        self.assertIn("заблокировано", message)
        self.assertNotIn("СЛИТО в main", message)

    def test_both_codeql_languages_are_required(self):
        checks = {
            "check_runs": [
                {"name": "Release gate", "status": "completed", "conclusion": "success"},
                {"name": "Secret scan", "status": "completed", "conclusion": "success"},
                {"name": "Analyze (javascript-typescript)", "status": "completed", "conclusion": "success"},
                {"name": "Analyze (python)", "status": "in_progress", "conclusion": None},
            ]
        }
        with patch.object(digest, "api_get", return_value=checks):
            lines, failed, passed = digest.check_summary("owner/repo", "sha")
        self.assertFalse(failed)
        self.assertFalse(passed)
        self.assertTrue(any("CodeQL / Python: ⏳" in line for line in lines))

    def test_no_secrets_skips_delivery(self):
        with patch.dict("os.environ", {"TELEGRAM_PR_BOT_TOKEN": "", "TELEGRAM_PR_CHAT_ID": ""}):
            digest.send_telegram("test")


if __name__ == "__main__":
    unittest.main()
