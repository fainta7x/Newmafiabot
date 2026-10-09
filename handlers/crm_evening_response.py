from datetime import datetime
from zoneinfo import ZoneInfo

import aiohttp
from aiogram import Bot, F, Router
from aiogram.enums import ChatType
from aiogram.filters import Command
from aiogram.types import CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton, Message

import bot_menu
import config
import database
from bot_api import cast_evening_vote, get_evening_slots, schedule_evening_followup, submit_evening_response
from bot_profile_link_api import link_legacy_profile
from crm_evening_keyboard import crm_evening_response_kb
from handlers.crm_group_stats import refresh_crm_group_stats

router = Router()

_STATUS_LABELS = {
    "going": "Буду",
    "late": "Приду позже",
    "thinking": "Пока думаю",
    "declined": "Не буду",
}


def _parse_starts_at(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(ZoneInfo("Europe/Moscow"))
    except (TypeError, ValueError):
        return None


def _response_keyboard(evening_id: str, selected_status: str | None = None) -> InlineKeyboardMarkup:
    response_markup = crm_evening_response_kb(evening_id, selected_status)
    app_markup = bot_menu.event_inline_keyboard(evening_id)
    rows = list(response_markup.inline_keyboard)
    if app_markup:
        rows.extend(app_markup.inline_keyboard)
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _selected_keyboard(existing: InlineKeyboardMarkup | None, evening_id: str, selected_status: str) -> InlineKeyboardMarkup:
    """Mark the chosen answer and keep the message's other buttons (games, map, «Назад»)."""
    rows = list(existing.inline_keyboard) if existing and existing.inline_keyboard else []
    extra = [row for row in rows if not any(str(button.callback_data or "").startswith("evr:") for button in row)]
    if not rows or len(extra) == len(rows):
        return _response_keyboard(evening_id, selected_status)
    answers = [row for row in crm_evening_response_kb(evening_id, selected_status).inline_keyboard
               if all(str(button.callback_data or "").startswith("evr:") for button in row)]
    return InlineKeyboardMarkup(inline_keyboard=answers + extra)


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
        reply_markup=_response_keyboard(evening_id),
    )


@router.callback_query(F.data.startswith("evlate:"))
async def choose_late_start(callback: CallbackQuery, bot: Bot):
    try:
        _, evening_id, slot_id = callback.data.split(":", 2)
    except (AttributeError, ValueError):
        await callback.answer("Некорректная игра", show_alert=True)
        return
    slots_result = await get_evening_slots(evening_id)
    slots = (slots_result.get("data") or {}).get("slots") or []
    selected = next((item for item in slots if str(item.get("slot_number")) == slot_id), None)
    if not slots_result.get("success") or not selected:
        await callback.answer("Игра недоступна. Открой вечер и выбери ещё раз.", show_alert=True)
        return
    slot_id = str(selected["id"])
    result = await submit_evening_response(evening_id, callback.from_user.id, "late", starting_slot_id=slot_id)
    if not result.get("success"):
        await callback.answer("Не удалось сохранить время прибытия. Обнови вечер и попробуй снова.", show_alert=True)
        return
    await callback.answer("✅ Записали с выбранной игры и на все следующие", show_alert=True)
    if callback.message and callback.message.chat.type == ChatType.PRIVATE:
        try:
            await callback.message.edit_reply_markup(reply_markup=_response_keyboard(evening_id, "late"))
        except Exception:
            pass
    try:
        await refresh_crm_group_stats(bot, evening_id)
    except Exception:
        pass


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

    if response_status == "late":
        slots_result = await get_evening_slots(evening_id)
        slots = (slots_result.get("data") or {}).get("slots") or []
        if not slots_result.get("success") or not slots:
            await callback.answer("Не удалось получить список игр. Попробуй позже.", show_alert=True)
            return
        rows = []
        for slot in slots:
            slot_id = str(slot.get("id") or "")
            if not slot_id:
                continue
            number = slot.get("slot_number") or "?"
            starts_at = _parse_starts_at(slot.get("starts_at"))
            clock = starts_at.strftime("%H:%M") if starts_at else "время уточняется"
            rows.append([InlineKeyboardButton(text=f"С игры №{number} · {clock}", callback_data=f"evlate:{evening_id}:{number}")])
        if not rows:
            await callback.answer("Для вечера пока нет доступных игр.", show_alert=True)
            return
        await callback.answer()
        if callback.message:
            await callback.message.answer(
                "⏳ <b>С какой игры тебя ждать?</b>\\nЗапишем на неё и все следующие.",
                parse_mode="HTML",
                reply_markup=InlineKeyboardMarkup(inline_keyboard=rows),
            )
        return

    result = await submit_evening_response(
        evening_id=evening_id,
        telegram_user_id=callback.from_user.id,
        response_status=response_status,
    )

    if result.get("success"):
        await callback.answer(f"✅ {_STATUS_LABELS[response_status]}", show_alert=False)
        try:
            # Group posts are shared. Do not paint one person's selected status for everyone.
            if callback.message and callback.message.chat.type == ChatType.PRIVATE:
                await callback.message.edit_reply_markup(
                    reply_markup=_selected_keyboard(callback.message.reply_markup, evening_id, response_status)
                )
        except Exception as exc:
            print(f"[CRM RSVP] Response saved, but selected button state was not updated: {exc}")
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

_FOLLOWUP_LABELS = {"morning": "утром в день игры", "3h": "за 3 часа до начала"}


@router.callback_query(F.data.startswith("evq:"))
async def handle_evening_followup(callback: CallbackQuery):
    """«Спроси утром / за 3 часа» under the «Что решил?» message for «Пока думаю» players."""
    try:
        _, evening_id, when = callback.data.split(":", 2)
    except (AttributeError, ValueError):
        await callback.answer("Некорректная кнопка", show_alert=True)
        return
    if when not in _FOLLOWUP_LABELS or not evening_id:
        await callback.answer("Некорректная кнопка", show_alert=True)
        return
    result = await schedule_evening_followup(evening_id, callback.from_user.id, when)
    if result.get("success"):
        await callback.answer(f"⏰ Хорошо, спросим {_FOLLOWUP_LABELS[when]}", show_alert=False)
        return
    error = result.get("error")
    if error == "not_thinking":
        text = "Ты уже ответил — напоминание не нужно."
    elif error in {"closed", "too_late"}:
        text = "Вечер уже начинается — ответь, пожалуйста, сейчас."
    elif error == "not_found":
        text = "Профиль клуба не найден. Нажми /start."
    else:
        text = "Не удалось сохранить. Попробуй позже."
    await callback.answer(text, show_alert=True)


_VOTE_MARK = "✅ "
_VOTE_ERRORS = {
    "closed": "Голосование по этому вечеру уже закрыто.",
    "not_attended": "Голосовать могут только игроки, которые были на этом вечере.",
    "not_completed": "Вечер ещё не завершён.",
    "not_found": "Профиль клуба не найден. Нажми /start.",
    "bad_nominee": "Этого игрока нельзя выбрать.",
    "ambiguous_nominee": "Не получилось определить игрока. Проголосуй в приложении: Клуб → Истории.",
}


def _mark_vote_choice(markup: InlineKeyboardMarkup | None, chosen_data: str) -> InlineKeyboardMarkup | None:
    """The same voting keyboard with a check mark on the player the voter chose (and on nobody else)."""
    if markup is None:
        return None
    rows = []
    for row in markup.inline_keyboard:
        new_row = []
        for button in row:
            text = button.text[len(_VOTE_MARK):] if button.text.startswith(_VOTE_MARK) else button.text
            if button.callback_data == chosen_data:
                text = f"{_VOTE_MARK}{text}"
            new_row.append(button.model_copy(update={"text": text}))
        rows.append(new_row)
    return InlineKeyboardMarkup(inline_keyboard=rows)


@router.callback_query(F.data.startswith("evv:"))
async def handle_evening_vote(callback: CallbackQuery):
    """A tap on a player under «Кто сыграл лучше всех?» is the vote for «MVP вечера»; another tap changes it."""
    try:
        _, evening_id, nominee = callback.data.split(":", 2)
    except (AttributeError, ValueError):
        await callback.answer("Некорректная кнопка", show_alert=True)
        return
    if not evening_id or not nominee:
        await callback.answer("Некорректная кнопка", show_alert=True)
        return
    result = await cast_evening_vote(evening_id, callback.from_user.id, nominee)
    if result.get("success"):
        chosen = (result.get("data") or {}).get("nominee") or "игрок"
        await callback.answer(f"✅ Твой голос: {chosen}", show_alert=False)
        try:
            if callback.message:
                await callback.message.edit_reply_markup(reply_markup=_mark_vote_choice(callback.message.reply_markup, callback.data))
        except Exception as exc:
            print(f"[EVENING VOTE] Vote saved, but the keyboard was not updated: {exc}")
        return
    await callback.answer(_VOTE_ERRORS.get(result.get("error"), "Не удалось сохранить голос. Попробуй позже."), show_alert=True)
