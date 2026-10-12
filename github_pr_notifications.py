"""Poll public GitHub PR metadata using the existing club bot; no extra credentials."""
import asyncio
import fcntl
import html
import json
import logging
import os
from pathlib import Path
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

import config

logger = logging.getLogger(__name__)
router = Router()
STATE = Path(os.getenv("GITHUB_PR_NOTIFICATION_STATE", "/data/github_pr_notifications.json"))
REPO = "fainta7x/Newmafiabot"
POLL_SECONDS = max(15, int(os.getenv("GITHUB_PR_POLL_SECONDS", "30")))
PULLS_PATH = "/pulls?state=all&sort=updated&direction=desc&per_page=25"
# Opened/merged inside this window is still announced when it was not seen open (a PR merged between two polls).
RECENT = timedelta(minutes=10)
_pulls_etag = None
CHECKS = ("Release gate", "Secret scan", "Analyze (javascript-typescript)", "Analyze (python)")


def fetch(path, etag=None):
    """GET from the public API. A conditional request answered 304 does not count against the rate limit."""
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "2la-noire-bot"}
    if etag:
        headers["If-None-Match"] = etag
    try:
        with urlopen(Request("https://api.github.com/repos/" + REPO + path, headers=headers), timeout=15) as response:
            return json.load(response), response.headers.get("ETag")
    except HTTPError as error:
        if error.code == 304:
            return None, etag
        raise


def github(path):
    return fetch(path)[0]


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
        return "ready", "✅ Проверки пройдены, ждёт слияния"
    return "pending", "⏳ В проверке"


def message(pr, label, checks, history):
    number = int(pr["number"])
    title = html.escape(pr.get("title", "")[:150])
    description = next((line.strip("-* ").strip() for line in (pr.get("body") or "").splitlines()
                        if len(line.strip()) > 15 and not line.lstrip().startswith(("#", "<", "|"))),
                       pr.get("title", ""))
    lines = ["<b>2LA Noire · GitHub</b>", label,
             '<a href="https://github.com/' + REPO + '/pull/' + str(number) + '">PR #' + str(number) + '</a> — ' + title,
             "Изменения: " + html.escape(description[:180])]
    if pr["state"] == "open" and checks:
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


def _state_of(pr):
    return "merged" if pr.get("merged_at") else "closed" if pr["state"] == "closed" else "open"


def _recent(pr):
    stamp = pr.get("merged_at") or pr.get("closed_at")
    if not stamp:
        return False
    try:
        moment = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
    except ValueError:
        return False
    return datetime.now(timezone.utc) - moment <= RECENT


async def tick(bot, recipients):
    """One poll. Announces a PR the moment it is opened, merged or closed; check results are only shown on request (/prs)."""
    global _pulls_etag
    STATE.parent.mkdir(parents=True, exist_ok=True)
    with STATE.with_suffix(".lock").open("a+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        pulls, _pulls_etag = await asyncio.to_thread(fetch, PULLS_PATH, _pulls_etag)
        if pulls is None:
            return  # nothing changed since the last poll
        state = load()
        if state is None:
            save({str(p["number"]): _state_of(p) for p in pulls})
            logger.info("PR monitor bootstrapped without historical notifications")
            return
        merges = sorted((p for p in pulls if p.get("merged_at")), key=lambda p: p["merged_at"], reverse=True)
        for pr in reversed(pulls):
            number = str(pr["number"])
            new_state = _state_of(pr)
            old = state.get(number)
            # States written by the first version («pending», «ready», «failed») all mean «still open».
            if old not in (None, "merged", "closed"):
                old = "open"
            if new_state == old:
                if state.get(number) != old:
                    state[number] = old
                    save(state)
                continue
            if old is None and new_state != "open" and not _recent(pr):
                state[number] = new_state
                save(state)
                continue
            label = "🆕 Открыт новый PR · ⏳ в проверке" if new_state == "open" else status(pr, [])[1]
            text = message(pr, label, [], [p for p in merges if p["number"] != pr["number"]])
            for recipient in recipients:
                try:
                    await bot.send_message(recipient, text, parse_mode="HTML", disable_web_page_preview=True)
                except Exception:
                    logger.exception("PR notice could not be delivered to %s", recipient)
            state[number] = new_state
            save(state)


async def overview():
    """What is open right now and how far its checks are: for the /prs command."""
    pulls = await asyncio.to_thread(github, PULLS_PATH)
    opened = [p for p in pulls if p["state"] == "open"]
    lines = ["<b>2LA Noire · GitHub</b>"]
    if not opened:
        lines.append("Открытых PR нет — всё слито или закрыто.")
    for pr in opened[:6]:
        checks = (await asyncio.to_thread(github, "/commits/" + pr["head"]["sha"] + "/check-runs?per_page=100")).get("check_runs", [])
        label = status(pr, checks)[1]
        title = html.escape(pr.get("title", "")[:90])
        number = int(pr["number"])
        lines.append('• <a href="https://github.com/' + REPO + '/pull/' + str(number) + '">#' + str(number) + "</a> " + title + "\n   " + label)
    merged = sorted((p for p in pulls if p.get("merged_at")), key=lambda p: p["merged_at"], reverse=True)[:3]
    if merged:
        lines.append("<b>Последние слияния:</b>")
        for item in merged:
            n = int(item["number"])
            lines.append('• <a href="https://github.com/' + REPO + '/pull/' + str(n) + '">#' + str(n) + "</a> " + html.escape(item.get("title", "")[:75]))
    lines.append("<i>Слияние в main не значит деплой на Amvera.</i>")
    return "\n".join(lines)[:3800]


@router.message(Command("prs"))
async def prs_command(message: Message):
    allowed = set(config.ADMIN_IDS) | set(config.ORGANIZER_NOTIFICATION_IDS)
    if not message.from_user or message.from_user.id not in allowed:
        return
    try:
        text = await overview()
    except Exception:
        logger.exception("PR overview unavailable")
        await message.answer("Не удалось получить список PR с GitHub. Попробуйте через минуту.")
        return
    await message.answer(text, parse_mode="HTML", disable_web_page_preview=True)


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
        await asyncio.sleep(POLL_SECONDS)
