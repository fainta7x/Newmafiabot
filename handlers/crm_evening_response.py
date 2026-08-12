from datetime import datetime

import aiohttp
from aiogram import Bot, F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, Message

import config
import database
from bot_api import submit_evening_response
from bot_profile_link_api import link_legacy_profile
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


@router.message(Command("linkprofile"))
async def link_crm_profile(message: Message):
    if not message.from_user:
        return

    legacy_user = await database.get_user_by_id(message.from_user.id)
    if not legacy_user:
        await message.answer(
            "Сначала нажмите /start. Если профиль уже есть в клубной базе, организатор поможет привязать его без создания дубля."
        )
        return

    _, _, _, nickname = legacy_user
    nickname = str(nickname or "").strip()
    if not nickname:
        await message.answer(
            "В старом профиле нет игрового ника. Нажмите /start — новый игрок сможет зарегистрироваться, а существующий профиль организатор привяжет вручную."
        )
        return

    result = await link_legacy_profile(
        telegram_user_id=message.from_user.id,
        telegram_username=message.from_user.username,
        nickname=nickname,
    )

    if result.get("success"):
        player = (result.get("data") or {}).get("player") or {}
        linked_nickname = player.get("nickname") or nickname
        await message.answer(
            f"✅ Профиль «{linked_nickname}» привязан к вашему Telegram. Теперь можно снова нажать кнопку ответа в анонсе."
        )
        return

    error = result.get("error")
    if error == "profile_not_found":
        text = (
            f"Не нашёл в CRM профиль с ником «{nickname}». Если вы новый игрок — нажмите /start и зарегистрируйтесь. Если уже играли — напишите организатору."
        )
    elif error == "ambiguous_profile":
        text = (
            f"В CRM найдено несколько профилей с ником «{nickname}». Автоматически привязывать небезопасно — напишите организатору."
        )
    elif error == "already_claimed":
        text = "Этот профиль уже привязан к другому Telegram. Напишите организатору."
    else:
        text = "Не удалось привязать профиль сейчас. Попробуйте ещё раз позже или напишите организатору."
    await message.answer(text)


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
        message = "Профиль клуба не найден. Откройте личный чат с ботом, нажмите /start и завершите регистрацию, затем повторите ответ."
    elif error == "attendance_locked":
        message = "Явка на этот вечер уже отмечена. Если ответ нужно исправить, напишите организатору."
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
