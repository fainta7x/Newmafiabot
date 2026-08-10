from datetime import datetime

from aiogram import Bot, F, Router
from aiogram.types import CallbackQuery, Message

from bot_api import get_evening_participants, get_open_evenings, submit_evening_response
from crm_evening_keyboard import crm_evening_response_kb, crm_evening_select_kb

router = Router()

_RESPONSE_LABELS = {
    "going": "Иду",
    "late": "Приду позже",
    "thinking": "Пока думаю",
    "declined": "Не иду",
}

_LEGACY_BOOK_TO_RESPONSE = {
    "book_ontime": "going",
    "book_late": "late",
    "book_thinking": "thinking",
    "book_no": "declined",
}


def _format_start(value: object) -> str:
    raw = str(value or "")
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).strftime("%d.%m.%Y в %H:%M")
    except (TypeError, ValueError):
        return raw or "Время уточняется"


def _evening_prompt(evening: dict) -> str:
    title = str(evening.get("title") or "Игровой вечер")
    venue = str(evening.get("venue") or "Суп с Котом")
    return (
        "🕵️ <b>2LA noire</b>\n\n"
        f"<b>{title}</b>\n"
        f"📍 {venue}\n"
        f"🕗 {_format_start(evening.get('starts_at'))}\n\n"
        "Как планируешь?"
    )


def _stats_block(title: str, players: list[str]) -> str:
    if not players:
        return f"{title}: —"
    return f"{title}:\n" + "\n".join(f"{index}. {name}" for index, name in enumerate(players, start=1))


async def build_crm_evening_stats_text(evening_id: str) -> str | None:
    """Build the public participant list from canonical CRM state only."""
    result = await get_evening_participants(evening_id)
    if not result.get("success"):
        return None

    payload = result.get("data") or {}
    evening = payload.get("evening") or {}
    participants = payload.get("participants") or []

    grouped = {status: [] for status in _RESPONSE_LABELS}
    for participant in participants:
        status = str(participant.get("response_status") or "")
        if status not in grouped:
            continue
        nickname = str(participant.get("nickname") or "Игрок без профиля")
        grouped[status].append(nickname)

    expected = len(grouped["going"]) + len(grouped["late"])
    title = str(evening.get("title") or "Игровой вечер")
    starts = _format_start(evening.get("starts_at"))

    return "\n\n".join([
        f"📊 <b>{title}</b>\n🕗 {starts}\nПланируют прийти: <b>{expected}</b>",
        _stats_block("✅ Идут", grouped["going"]),
        _stats_block("⏳ Придут позже", grouped["late"]),
        _stats_block("🤔 Пока думают", grouped["thinking"]),
        _stats_block("❌ Не идут", grouped["declined"]),
    ])


async def _load_open_evenings() -> list[dict] | None:
    result = await get_open_evenings()
    if not result.get("success"):
        return None
    data = result.get("data")
    return data if isinstance(data, list) else None


@router.message(F.text == "🕵️ Записаться на игру", F.chat.type == "private")
async def crm_book(message: Message):
    evenings = await _load_open_evenings()
    if evenings is None:
        await message.answer("Не удалось загрузить вечера из CRM. Попробуйте чуть позже.")
        return
    if not evenings:
        await message.answer("Сейчас нет опубликованных вечеров с открытой записью.")
        return
    if len(evenings) == 1:
        evening = evenings[0]
        await message.answer(
            _evening_prompt(evening),
            parse_mode="HTML",
            reply_markup=crm_evening_response_kb(str(evening["id"])),
        )
        return

    await message.answer(
        "Сейчас открыто несколько вечеров. Выберите, на какой хотите ответить:",
        reply_markup=crm_evening_select_kb(evenings),
    )


@router.callback_query(F.data.startswith("evsel:"))
async def select_crm_evening(callback: CallbackQuery):
    evening_id = str(callback.data or "").split(":", 1)[1]
    evenings = await _load_open_evenings()
    if evenings is None:
        await callback.answer("Не удалось загрузить вечера", show_alert=True)
        return

    evening = next((item for item in evenings if str(item.get("id")) == evening_id), None)
    if not evening:
        await callback.answer("Этот вечер уже закрыт для записи", show_alert=True)
        return

    await callback.message.edit_text(
        _evening_prompt(evening),
        parse_mode="HTML",
        reply_markup=crm_evening_response_kb(evening_id),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("book_"))
async def bridge_legacy_booking(callback: CallbackQuery, bot: Bot):
    response_status = _LEGACY_BOOK_TO_RESPONSE.get(str(callback.data or ""))
    if not response_status:
        return

    evenings = await _load_open_evenings()
    if evenings is None:
        await callback.answer("CRM временно недоступна", show_alert=True)
        return
    if not evenings:
        await callback.answer("Сейчас нет открытого вечера", show_alert=True)
        return
    if len(evenings) > 1:
        if callback.message and callback.message.chat.type == "private":
            await callback.message.answer(
                "Открыто несколько вечеров. Сначала выберите нужный:",
                reply_markup=crm_evening_select_kb(evenings),
            )
            await callback.answer()
        else:
            await callback.answer(
                "Открыто несколько вечеров. Выберите нужный через бота в личных сообщениях.",
                show_alert=True,
            )
        return

    evening_id = str(evenings[0].get("id") or "")
    result = await submit_evening_response(
        evening_id=evening_id,
        telegram_user_id=callback.from_user.id,
        response_status=response_status,
    )
    if result.get("success"):
        await callback.answer(f"✅ {_RESPONSE_LABELS[response_status]}")
        try:
            from handlers.crm_group_stats import refresh_crm_group_stats
            await refresh_crm_group_stats(bot, evening_id)
        except Exception as exc:
            print(f"[CRM STATS] Legacy response saved, but group list refresh failed: {exc}")
        return

    error = result.get("error")
    if error == "not_found":
        text = "Ваш Telegram пока не привязан к профилю игрока"
    elif error == "closed":
        text = "Этот вечер уже закрыт"
    else:
        text = "Не удалось сохранить ответ. Попробуйте позже"
    await callback.answer(text, show_alert=True)


@router.message(F.text == "🧾 Список игроков", F.chat.type == "private")
async def crm_players_list(message: Message):
    evenings = await _load_open_evenings()
    if evenings is None:
        await message.answer("Не удалось загрузить список из CRM. Попробуйте чуть позже.")
        return
    if not evenings:
        await message.answer("Сейчас нет опубликованных вечеров с открытой записью.")
        return

    sent = False
    for evening in evenings:
        evening_id = str(evening.get("id") or "")
        if not evening_id:
            continue
        text = await build_crm_evening_stats_text(evening_id)
        if text:
            await message.answer(text, parse_mode="HTML")
            sent = True

    if not sent:
        await message.answer("Не удалось загрузить состав вечера из CRM.")
