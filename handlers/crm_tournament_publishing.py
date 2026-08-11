from datetime import datetime
from html import escape

from aiogram import Bot

from bot_telegram_api import get_tournament_telegram_plan, save_tournament_telegram_publication
from handlers.crm_telegram_publishing import _edit_message, _send_message


def _format_date(value: object) -> str:
    raw = str(value or "")
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).strftime("%d.%m.%Y · %H:%M")
    except (TypeError, ValueError):
        return raw or "Дата уточняется"


def _tournament_text(tournament: dict, participants: list[dict]) -> str:
    title = escape(str(tournament.get("title") or "Турнир 2LA noire"))
    venue = str(tournament.get("venue") or "").strip()
    stage = str(tournament.get("stage") or "").strip()
    judge = str(tournament.get("chief_judge_name") or "").strip()
    notes = str(tournament.get("notes") or "").strip()
    lines = [
        "🏆 <b>Рейтинг и турниры · 2LA noire</b>",
        "",
        f"<b>{title}</b>",
        f"📅 {_format_date(tournament.get('date'))}",
    ]
    if venue:
        lines.append(f"📍 {escape(venue)}")
    if stage:
        lines.append(f"🎯 {escape(stage)}")
    if judge:
        lines.append(f"⚖️ Главный судья: {escape(judge)}")
    if notes:
        lines.extend(["", escape(notes[:700])])
    if participants:
        names = [escape(str(item.get("display_name") or item.get("nickname") or "Игрок")) for item in participants]
        lines.extend(["", "👥 <b>Участники:</b>", ", ".join(names)])
    return "\n".join(lines)


def _closed_text(tournament: dict, participants: list[dict]) -> str:
    return f"🔒 <b>Турнир завершён</b>\n\n{_tournament_text(tournament, participants)}"


async def sync_tournament_telegram(bot: Bot, tournament_id: str, *, allow_create: bool = True) -> dict:
    plan_result = await get_tournament_telegram_plan(tournament_id)
    if not plan_result.get("success"):
        return {"success": False, "error": plan_result.get("error") or "plan_unavailable"}

    plan = plan_result.get("data") or {}
    tournament = plan.get("tournament") or {}
    participants = plan.get("participants") or []
    destinations = {str(item.get("id")): item for item in (plan.get("destinations") or [])}
    publications = {str(item.get("destination_id")): item for item in (plan.get("publications") or [])}
    desired = {str(item) for item in (plan.get("desired_destination_ids") or [])}
    results = []

    for destination_id, publication in publications.items():
        if destination_id in desired:
            continue
        ok = await _edit_message(
            bot,
            publication.get("chat_id"),
            int(publication.get("message_id")),
            _closed_text(tournament, participants),
            None,
        )
        results.append({"destination_id": destination_id, "action": "closed", "success": ok})

    for destination_id in desired:
        destination = destinations.get(destination_id) or {}
        publication = publications.get(destination_id)
        text = _tournament_text(tournament, participants)
        if publication:
            ok = await _edit_message(
                bot,
                publication.get("chat_id"),
                int(publication.get("message_id")),
                text,
                None,
            )
            results.append({"destination_id": destination_id, "action": "edited", "success": ok})
            continue
        if not allow_create or not destination.get("active") or not str(destination.get("chat_id") or "").strip():
            results.append({"destination_id": destination_id, "action": "skipped", "success": True})
            continue
        chat_id = str(destination.get("chat_id")).strip()
        try:
            message = await _send_message(bot, chat_id, None, text, None)
            saved = await save_tournament_telegram_publication(
                tournament_id,
                destination_id,
                chat_id,
                message.message_id,
            )
            results.append({
                "destination_id": destination_id,
                "action": "created",
                "success": bool(saved.get("success")),
                "message_id": message.message_id,
            })
        except Exception as exc:
            results.append({"destination_id": destination_id, "action": "create_failed", "success": False, "error": str(exc)})

    return {
        "success": not any(not item.get("success") for item in results),
        "tournament_id": tournament_id,
        "results": results,
    }
