#!/usr/bin/env python3
"""Read-only GitHub PR digests delivered by the club Telegram bot."""
from __future__ import annotations

import html
import json
import os
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

API = "https://api.github.com"


def api_get(path: str):
    req = Request(API + path, headers={
        "Authorization": "Bearer " + os.environ["GH_TOKEN"],
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "2la-noire-pr-notifier",
    })
    with urlopen(req, timeout=15) as response:
        return json.load(response)


def compact(value: str, limit: int = 160) -> str:
    return re.sub(r"\s+", " ", value or "").strip()[:limit]


def changes(pr: dict) -> list[str]:
    """Only report changes actually described in the PR."""
    results = []
    for line in (pr.get("body") or "").replace("\r", "").splitlines():
        line = line.strip()
        if not line or line.startswith(("#", "<!--", ">", "|", "---")):
            continue
        line = re.sub(r"^[-*+] |\d+[.)] ", "", line)
        line = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", line)
        line = re.sub(r"[*_~]", "", line)
        if len(line) >= 12 and not line.lower().startswith(("closes #", "fixes #", "test:", "tests:")):
            results.append(compact(line, 180))
        if len(results) == 3:
            break
    return results


def check_state(check: dict | None) -> str:
    if check is None:
        return "⏳ нет результата"
    if check.get("status") != "completed":
        return "⏳ выполняется"
    conclusion = check.get("conclusion")
    if conclusion == "success":
        return "✅ пройдена"
    if conclusion in ("neutral", "skipped"):
        return "⚪ пропущена"
    return "❌ " + compact(conclusion or "неуспешна", 36)


def check_summary(repo: str, sha: str) -> tuple[list[str], bool, bool]:
    checks = api_get(f"/repos/{repo}/commits/{sha}/check-runs?per_page=100").get("check_runs", [])
    def pick(predicate):
        return next((c for c in checks if predicate(c.get("name", ""))), None)
    pairs = [
        ("CI / Release gate", pick(lambda name: name == "Release gate")),
        ("Gitleaks / Secret scan", pick(lambda name: name == "Secret scan")),
        ("CodeQL", pick(lambda name: name.startswith("Analyze (") or "CodeQL" in name)),
    ]
    lines = [f"• {label}: {check_state(check)}" for label, check in pairs]
    failed = any(c and c.get("status") == "completed" and c.get("conclusion") in ("failure", "timed_out", "cancelled", "action_required") for _, c in pairs)
    passed = all(c and c.get("status") == "completed" and c.get("conclusion") == "success" for _, c in pairs)
    return lines, bool(failed), bool(passed)


def recent_merges(repo: str, exclude_number: int | None) -> list[str]:
    pulls = api_get(f"/repos/{repo}/pulls?state=closed&sort=updated&direction=desc&per_page=60")
    merged = sorted(
        (p for p in pulls if p.get("merged_at") and p.get("number") != exclude_number),
        key=lambda p: p["merged_at"], reverse=True,
    )[:3]
    return [f"• <a href=\"https://github.com/{repo}/pull/{p['number']}\">#{p['number']}</a> {html.escape(compact(p.get('title', ''), 65))}" for p in merged]


def prepare_message(repo: str, pr: dict | None, event_name: str, event: dict) -> str:
    parts = ["<b>2LA Noire · GitHub</b>"]
    number = pr["number"] if pr else None
    if not pr:
        parts += ["🧪 <b>Тест уведомления</b>", "Подключение GitHub → Telegram работает."]
    else:
        merged = bool(pr.get("merged") or pr.get("merged_at"))
        closed = pr.get("state") == "closed"
        workflow = event.get("workflow_run", {})
        if merged:
            headline = "✅ СЛИТО в main"
        elif closed:
            headline = "⚪ ЗАКРЫТО без слияния"
        elif event_name == "workflow_run" and workflow.get("conclusion") == "failure":
            headline = "❌ CI завершился ошибкой"
        elif event_name == "workflow_run" and workflow.get("conclusion") == "success":
            headline = "🔎 CI завершён — статус проверок ниже"
        else:
            headline = "⏳ ОЖИДАЕМ ТЕСТЫ / AUTO-MERGE"
        parts += [
            headline,
            f"<b>PR <a href=\"https://github.com/{repo}/pull/{number}\">#{number}</a>:</b> {html.escape(compact(pr.get('title', ''), 150))}",
            "\n<b>Что меняется:</b>",
        ]
        parts.extend(f"• {html.escape(x)}" for x in (changes(pr) or ["Описание — по ссылке на PR"]))
        sha = pr.get("head", {}).get("sha")
        if sha:
            try:
                checks, failed, passed = check_summary(repo, sha)
                parts.extend(["\n<b>Проверки:</b>", *checks])
                if not closed:
                    if failed:
                        parts.append("⚠️ Автоматическое слияние заблокировано ошибкой проверки.")
                    elif passed:
                        parts.append("✅ Основные проверки успешны. Окончательное решение о слиянии принимает GitHub.")
                    else:
                        parts.append("⏳ Не все основные проверки завершились.")
            except (HTTPError, URLError, TimeoutError) as exc:
                print(f"Unable to fetch checks: {type(exc).__name__}", file=sys.stderr)
                parts.append("\nПроверки: статус временно недоступен.")
        if merged:
            parts.append("\n<i>Слияние в main ещё не подтверждает деплой на Amvera.</i>")
    try:
        history = recent_merges(repo, number)
        if history:
            parts.extend(["\n<b>Последние предыдущие слияния:</b>", *history])
    except (HTTPError, URLError, TimeoutError) as exc:
        print(f"Unable to fetch history: {type(exc).__name__}", file=sys.stderr)
    return "\n".join(parts)[:3900]


def find_pr(repo: str, name: str, event: dict):
    if name == "pull_request_target":
        return event.get("pull_request")
    if name == "workflow_run":
        run = event.get("workflow_run", {})
        if run.get("event") != "pull_request":
            return None
        linked = run.get("pull_requests") or []
        if linked:
            return api_get(f"/repos/{repo}/pulls/{linked[0]['number']}")
        sha = run.get("head_sha")
        if sha:
            matches = api_get(f"/repos/{repo}/commits/{sha}/pulls")
            if matches:
                return api_get(f"/repos/{repo}/pulls/{matches[0]['number']}")
    return None


def send_telegram(message: str) -> None:
    token = os.environ.get("TELEGRAM_PR_BOT_TOKEN", "").strip()
    recipient = os.environ.get("TELEGRAM_PR_CHAT_ID", "").strip()
    if not token or not recipient:
        print("PR notification secrets are not configured; skip delivery.")
        return
    if not re.fullmatch(r"-?\d+", recipient):
        raise ValueError("TELEGRAM_PR_CHAT_ID must be numeric")
    body = json.dumps({
        "chat_id": recipient,
        "text": message,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }).encode()
    req = Request(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(req, timeout=20) as response:
            result = json.load(response)
    except HTTPError as exc:
        # Never expose the Telegram request URL, which contains the token.
        raise RuntimeError(f"Telegram rejected the notification (HTTP {exc.code})") from None
    except URLError:
        raise RuntimeError("Telegram notification network error") from None
    if not result.get("ok"):
        raise RuntimeError("Telegram notification returned unsuccessful response")
    print("Telegram notification sent.")


def main() -> None:
    repo = os.environ["GITHUB_REPOSITORY"]
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repo):
        raise ValueError("Invalid repository identifier")
    with open(os.environ["GITHUB_EVENT_PATH"], encoding="utf-8") as stream:
        event = json.load(stream)
    name = os.environ["GITHUB_EVENT_NAME"]
    pr = find_pr(repo, name, event)
    if name != "workflow_dispatch" and not pr:
        print("No linked pull request; skip.")
        return
    if name == "workflow_run" and pr.get("state") != "open":
        print("PR already closed; a closed-event message owns the final status.")
        return
    send_telegram(prepare_message(repo, pr, name, event))


if __name__ == "__main__":
    main()
