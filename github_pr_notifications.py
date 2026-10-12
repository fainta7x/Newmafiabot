"""Poll public GitHub PR metadata using the existing club bot; no extra credentials."""
import asyncio
import fcntl
import html
import json
import logging
import os
from pathlib import Path
from urllib.request import Request, urlopen

import config

logger = logging.getLogger(__name__)
STATE = Path(os.getenv("GITHUB_PR_NOTIFICATION_STATE", "/data/github_pr_notifications.json"))
REPO = "fainta7x/Newmafiabot"
CHECKS = ("Release gate", "Secret scan", "Analyze (javascript-typescript)", "Analyze (python)")


def github(path):
    req = Request("https://api.github.com/repos/" + REPO + path, headers={
        "Accept": "application/vnd.github+json", "User-Agent": "2la-noire-bot"})
    with urlopen(req, timeout=15) as response:
        return json.load(response)


def status(pr, checks):
    if pr.get("merged_at"):
        return "merged", "✅ Слито в main"
    if pr["state"] == "closed":
        return "closed", "⚪ Закрыто без слияния"
    found = {check["name"]: check for check in checks}
    selected = [found.get(name) for name in CHECKS]
    if any(c and c.get("conclusion") in ("failure", "cancelled", "timed_out") for c in selected):
        return "failed", "❌ Тесты не прошли"
    if all(c and c.get("status") == "completed" and c.get("conclusion") == "success" for c in selected):
        return "ready", "✅ Проверки пройдены, ожидаем merge"
    return "pending", "⏳ Ожидаем тесты"


def message(pr, label, checks, history):
    number = int(pr["number"])
    title = html.escape(pr.get("title", "")[:150])
    description = next((line.strip("-* ").strip() for line in (pr.get("body") or "").splitlines()
                        if len(line.strip()) > 15 and not line.lstrip().startswith(("#", "<", "|"))),
                       pr.get("title", ""))
    lines = ["<b>2LA Noire · GitHub</b>", label,
             '<a href="https://github.com/' + REPO + '/pull/' + str(number) + '">PR #' + str(number) + '</a> — ' + title,
             "Изменения: " + html.escape(description[:180])]
    if pr["state"] == "open":
        found = {check["name"]: check for check in checks}
        lines.append("<b>Проверки:</b>")
        for name in CHECKS:
            check = found.get(name)
            mark = ("⏳" if not check or check.get("status") != "completed" else
                    "✅" if check.get("conclusion") == "success" else
                    "⚪" if check.get("conclusion") in ("skipped", "neutral") else "❌")
            lines.append(mark + " " + html.escape(name))
    lines.append("<b>Последние слияния:</b>")
    for item in history[:3]:
        n = int(item["number"])
        lines.append('• <a href="https://github.com/' + REPO + '/pull/' + str(n) + '">#' + str(n) + '</a> ' +
                     html.escape(item.get("title", "")[:75]))
    if pr.get("merged_at"):
        lines.append("<i>Это не подтверждает деплой на Amvera.</i>")
    return "\n".join(lines)[:3800]


def load():
    if not STATE.exists():
        return None
    with STATE.open(encoding="utf-8") as file:
        data = json.load(file)
    if not isinstance(data, dict):
        raise ValueError("Invalid notification state")
    return data


def save(data):
    temp = STATE.with_suffix(".tmp")
    with temp.open("w", encoding="utf-8") as file:
        json.dump(data, file)
        file.flush()
        os.fsync(file.fileno())
    os.replace(temp, STATE)


async def tick(bot, recipients):
    STATE.parent.mkdir(parents=True, exist_ok=True)
    with STATE.with_suffix(".lock").open("a+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        pulls = await asyncio.to_thread(github, "/pulls?state=all&sort=updated&direction=desc&per_page=25")
        state = load()
        if state is None:
            save({str(p["number"]): ("merged" if p.get("merged_at") else "closed" if p["state"] == "closed" else "pending")
                  for p in pulls})
            logger.info("PR monitor bootstrapped without historical notifications")
            return
        merges = sorted((p for p in pulls if p.get("merged_at")), key=lambda p: p["merged_at"], reverse=True)
        checked = 0
        for pr in reversed(pulls):
            number = str(pr["number"])
            checks = []
            if pr["state"] == "open":
                if checked >= 5:
                    continue
                checked += 1
                result = await asyncio.to_thread(github, "/commits/" + pr["head"]["sha"] + "/check-runs?per_page=100")
                checks = result.get("check_runs", [])
            new_status, label = status(pr, checks)
            old = state.get(number)
            if new_status == old:
                continue
            if old is None and pr["state"] == "closed":
                state[number] = new_status
                save(state)
                continue
            text = message(pr, label, checks, [p for p in merges if p["number"] != pr["number"]])
            for recipient in recipients:
                await bot.send_message(recipient, text, parse_mode="HTML", disable_web_page_preview=True)
            state[number] = new_status
            save(state)


async def github_pr_notification_task(bot):
    recipients = list(dict.fromkeys(config.ORGANIZER_NOTIFICATION_IDS))
    if not recipients:
        logger.info("PR monitor disabled: no organizer notification recipients configured")
        return
    while True:
        try:
            await tick(bot, recipients)
        except Exception:
            logger.exception("PR monitor unavailable; retrying")
        await asyncio.sleep(600)
