from datetime import datetime

import aiohttp
from aiogram import Bot, F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, Message

import config
from bot_api import submit_evening_response
from crm_evening_keyboard import crm_evening_response_kb
from handlers.crm_group_stats import refresh_crm_group_stats

router = Router()

_STATUS_LABELS = {
    "going": "Иду",
    "late": "Приду позже",
    "thinking": "Пока думаю",
    "declined": "Не иду",
}


def _parse_starts_at(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


@router.message(Command("testcrm"))
async def send_crm_evening_self_test(message: Message):
    if not message.from_user or message.from_user.id not in config.ADMIN_IDS:
        await message.answer("Команда доступна только организатору.")
        return

    base_url = str(config.BOT_API_BASE_URL or "").rstrip("/")
    if not base_url:
        await message.answer("Не настроен адрес web-приложения (BOT_API_BASE_URL).")
        return

    try:
        timeout = aiohttp.ClientTimeout(total=60)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(f"{base_url}/api/evenings") as response:
                if response.status != 200:
                    await message.answer(f"Не удалось получить вечера из CRM (HTTP {response.status}).")
                    return
                evenings = await response.json()
    except Exception:
        await message.answer("Не удалось связаться с CRM. Попробуй ещё раз через минуту.")
        return

    if not isinstance(evenings, list) or not evenings:
        await message.answer("В CRM пока нет опубликованного или активного вечера.")
        return

    now = datetime.now().astimezone()
    future_evenings = []
    for evening in evenings:
        starts_at = _parse_starts_at(evening.get("starts_at")) if isinstance(evening, dict) else None
        if starts_at is not None and (starts_at.tzinfo is None or starts_at >= now):
            future_evenings.append((starts_at, evening))

    if future_evenings:
        future_evenings.sort(key=lambda item: item[0])
        evening = future_evenings[0][1]
    else:
        evening = evenings[0]

    evening_id = str(evening.get("id") or "")
    if not evening_id:
        await message.answer("CRM вернула вечер без ID — тест остановлен.")
        return

    starts_at = _parse_starts_at(evening.get("starts_at"))
    starts_text = starts_at.strftime("%d.%m.%Y в %H:%M") if starts_at else str(evening.get("starts_at") or "Время уточняется")
    title = str(evening.get("title") or "Игровой вечер")
    venue = str(evening.get("venue") or "Суп с Котом")

    text = (
        "🕵️ <b>2LA noire</b>\n\n"
        f"<b>{title}</b>\n"
        f"📍 {venue}\n"
        f"🕗 {starts_text}\n\n"
        "Как планируешь?"
    )
    await message.answer(
        text,
        parse_mode="HTML",
        reply_markup=crm_evening_response_kb(evening_id),
    )


@router.callback_query(F.data.startswith("evr:"))
async def handle_crm_evening_response(callback: CallbackQuery, bot: Bot):
    try:
        _, evening_id, response_status = callback.data.split(":", 2)
    except (AttributeError, ValueError):
        await callback.answer("Некорректная кнопка", show_alert=True)
        return

    if response_status not in _STATUS_LABELS or not evening_id:
        await callback.answer("Некорректный статус", show_alert=True)
        return

    result = await submit_evening_response(
        evening_id=evening_id,
        telegram_user_id=callback.from_user.id,
        response_status=response_status,
    )

    if result.get("success"):
        await callback.answer(f"✅ {_STATUS_LABELS[response_status]}", show_alert=False)
        try:
            await refresh_crm_group_stats(bot, evening_id)
        except Exception as exc:
            print(f"[CRM STATS] Response saved, but group list refresh failed: {exc}")
        return

    error = result.get("error")
    if error == "not_found":
        message = "Вечер или профиль не найден"
    elif error == "closed":
        message = "Этот вечер уже закрыт"
    elif error == "invalid":
        message = "Ответ не принят"
    else:
        message = "Не удалось сохранить ответ. Попробуйте позже"

    try:
        await callback.answer(message, show_alert=True)
    except Exception:
        pass
