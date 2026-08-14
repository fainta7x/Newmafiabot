from aiogram import F, Router
from aiogram.filters import Command, CommandObject
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message

import bot_menu
import config
import database
from bot_profile_link_api import get_canonical_profile, link_legacy_profile, register_canonical_profile
from bot_telegram_api import get_telegram_destinations
from handlers.booking import build_stats_text, get_next_friday

router = Router()
_club_access_requests: set[int] = set()


class RegistrationForm(StatesGroup):
    waiting_for_nickname = State()


async def _is_judge(user_id: int) -> bool:
    if user_id in config.ADMIN_IDS:
        return True
    return user_id in await database.get_game_judges()


async def _main_menu(user_id: int):
    is_admin = user_id in config.ADMIN_IDS
    is_judge = await _is_judge(user_id)
    return bot_menu.main_menu_for_user(is_admin=is_admin, is_judge=is_judge)


async def _destination(destination_id: str) -> dict:
    result = await get_telegram_destinations()
    if not result.get("success"):
        return {}
    rows = (result.get("data") or {}).get("destinations") or []
    return next((item for item in rows if str(item.get("id")) == destination_id), {}) or {}


def _url_keyboard(text: str, url: str | None) -> InlineKeyboardMarkup | None:
    if not url:
        return None
    return InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text=text, url=url)]])


async def _handle_club_access(message: Message, kb) -> None:
    canonical = await get_canonical_profile(message.from_user.id)
    if not canonical.get("success"):
        await message.answer(
            "Чтобы проверить доступ в основной клуб, сначала нужен профиль игрока. "
            "Открой /start и заверши регистрацию.",
            reply_markup=kb,
        )
        return

    player = (canonical.get("data") or {}).get("player") or {}
    level = str(player.get("game_level") or "novice").strip().lower()
    nickname = str(player.get("nickname") or message.from_user.full_name or "Игрок")

    if level in {"club", "tournament", "rating"}:
        club = await _destination("club")
        club_url = str(club.get("invite_url") or "").strip() or None
        if club_url:
            await message.answer(
                "✅ <b>Доступ в основной клуб подтверждён.</b>\n\n"
                "Можешь вступить в основной чат 2LA Noire:",
                parse_mode="HTML",
                reply_markup=_url_keyboard("🎭 Вступить в основной клуб", club_url),
            )
        else:
            await message.answer(
                "✅ Доступ в основной клуб у тебя есть, но ссылка сейчас временно не настроена. Напиши организатору.",
                reply_markup=kb,
            )
        return

    novice = await _destination("novice")
    novice_url = str(novice.get("invite_url") or "").strip() or None

    if message.from_user.id not in _club_access_requests and config.ADMIN_IDS:
        _club_access_requests.add(message.from_user.id)
        username = f"@{message.from_user.username}" if message.from_user.username else "без @username"
        try:
            await message.bot.send_message(
                config.ADMIN_IDS[0],
                "🎭 <b>Запрос на допуск в основной клуб</b>\n\n"
                f"Игрок: <b>{nickname}</b>\n"
                f"Telegram: {username}\n"
                f"ID: <code>{message.from_user.id}</code>\n"
                f"Текущий уровень: <code>{level}</code>\n\n"
                "Если игрок подходит для основного клуба — измени ему игровой уровень в CRM. "
                "До этого ссылка на основной клуб ему не выдаётся.",
                parse_mode="HTML",
            )
        except Exception:
            pass

    text = (
        "🔒 <b>Доступ в основной клуб пока не открыт.</b>\n\n"
        "Основной клуб доступен только после подтверждения организатора. "
        "Запрос на допуск отправлен.\n\n"
        "Пока можешь присоединиться к Школе мафии — там проходят игры для новичков и тех, кто ещё знакомится с нашим клубом."
    )
    await message.answer(
        text,
        parse_mode="HTML",
        reply_markup=_url_keyboard("🌱 Вступить в Школу мафии", novice_url) or kb,
    )


async def _send_normal_start(
    message: Message,
    command: CommandObject | None = None,
    *,
    args_override: str | None = None,
):
    args = args_override if args_override is not None else ((command.args or "").strip() if command else "")
    kb = await _main_menu(message.from_user.id)

    # Keep old deep links alive while the Telegram shell migrates to the Mini App.
    if args == "players":
        date_str = get_next_friday()
        await message.answer(await build_stats_text(date_str), reply_markup=kb)
        return

    if args.startswith("profile_"):
        target_id = args.replace("profile_", "")
        from handlers.start_profile import show_other_profile
        await show_other_profile(message, target_id)
        return

    if args == "club_access":
        await _handle_club_access(message, kb)
        return

    await message.answer(
        bot_menu.start_text(message.from_user.first_name if message.from_user else None),
        parse_mode="HTML",
        reply_markup=kb,
    )


@router.message(Command("app"), F.chat.type == "private")
async def open_player_app(message: Message):
    inline_kb = bot_menu.app_inline_keyboard()
    if inline_kb:
        await message.answer(
            "🎭 <b>2LA Noire</b>\n\nОткрывай клуб — запись, игры, рейтинг, кошелёк и профиль теперь собраны в одном приложении.",
            parse_mode="HTML",
            reply_markup=inline_kb,
        )
        return

    await message.answer(
        "⚠️ Адрес приложения пока не настроен в боте. Сообщи организатору.",
        reply_markup=await _main_menu(message.from_user.id),
    )


@router.message(F.text == bot_menu.APP_BUTTON_TEXT, F.chat.type == "private")
async def open_player_app_fallback(message: Message):
    """Used only when a WebApp URL is not configured and Telegram sends plain button text."""
    await open_player_app(message)


@router.message(F.text == bot_menu.CLUB_ACCESS_BUTTON_TEXT, F.chat.type == "private")
async def club_access_from_menu(message: Message):
    await _handle_club_access(message, await _main_menu(message.from_user.id))


@router.message(F.text == bot_menu.REGULATIONS_BUTTON_TEXT, F.chat.type == "private")
async def regulations_from_compact_menu(message: Message):
    # Reuse the authoritative legacy text without restoring the old oversized keyboard.
    from handlers.start_profile import REGULATIONS_TEXT
    await message.answer(
        REGULATIONS_TEXT,
        parse_mode=None,
        reply_markup=await _main_menu(message.from_user.id),
    )


@router.message(F.text == "🏠 В главное меню", F.chat.type == "private")
async def back_to_compact_main_menu(message: Message):
    await message.answer(
        bot_menu.start_text(message.from_user.first_name if message.from_user else None),
        parse_mode="HTML",
        reply_markup=await _main_menu(message.from_user.id),
    )


@router.message(Command("start"), F.chat.type == "private")
async def start_with_registration(message: Message, command: CommandObject, state: FSMContext):
    if not message.from_user:
        return

    await database.init_db()
    await database.add_or_update_user(
        message.from_user.id,
        message.from_user.username,
        message.from_user.full_name,
    )

    args = (command.args or "").strip()
    canonical = await get_canonical_profile(message.from_user.id)
    if canonical.get("success"):
        await state.clear()
        await _send_normal_start(message, command)
        return

    if canonical.get("error") != "not_found":
        await state.clear()
        await message.answer("⚠️ Новая клубная база временно недоступна, но бот продолжает работать.")
        await _send_normal_start(message, command)
        return

    legacy_user = await database.get_user_by_id(message.from_user.id)
    legacy_nickname = str(legacy_user[3] or "").strip() if legacy_user else ""
    if legacy_nickname:
        linked = await link_legacy_profile(
            telegram_user_id=message.from_user.id,
            telegram_username=message.from_user.username,
            nickname=legacy_nickname,
        )
        if linked.get("success"):
            await state.clear()
            await message.answer(f"✅ Профиль «{legacy_nickname}» привязан к новой системе клуба.")
            await _send_normal_start(message, command)
            return

    await state.set_state(RegistrationForm.waiting_for_nickname)
    await state.update_data(pending_start_arg=args)
    await message.answer(
        "🎭 Добро пожаловать в 2LA Noire!\n\n"
        "Чтобы зарегистрироваться, пришли одним сообщением свой игровой ник. "
        "Он будет отображаться в приложении, записях, играх, рейтингах и турнирах.\n\n"
        "Если ты уже играл в клубе и профиль точно есть в базе, не создавай второй — напиши организатору для привязки существующего профиля."
    )


@router.message(
    RegistrationForm.waiting_for_nickname,
    F.chat.type == "private",
    F.text,
    ~F.text.startswith("/"),
)
async def finish_registration(message: Message, state: FSMContext):
    if not message.from_user:
        return

    nickname = str(message.text or "").strip().replace("\n", " ")
    if not nickname:
        await message.answer("Пришли игровой ник текстом.")
        return
    if len(nickname) > 60:
        await message.answer("Ник слишком длинный. Максимум 60 символов.")
        return

    state_data = await state.get_data()
    pending_start_arg = str(state_data.get("pending_start_arg") or "").strip()

    result = await register_canonical_profile(
        telegram_user_id=message.from_user.id,
        telegram_username=message.from_user.username,
        full_name=message.from_user.full_name,
        nickname=nickname,
    )

    if result.get("success"):
        player = (result.get("data") or {}).get("player") or {}
        registered_nickname = str(player.get("nickname") or nickname)
        try:
            await database.update_nickname(message.from_user.id, registered_nickname)
        except Exception:
            pass
        await state.clear()
        await message.answer(
            f"✅ Готово! Профиль «{registered_nickname}» создан и привязан к твоему Telegram."
        )
        await _send_normal_start(message, args_override=pending_start_arg)
        return

    error = result.get("error")
    if error == "nickname_taken":
        await state.clear()
        await message.answer(
            "Игрок с таким ником уже есть в клубе. Новый профиль я не создаю, чтобы не сделать дубль. "
            "Если это твой старый профиль — напиши организатору, он привяжет его к Telegram."
        )
        return
    if error in {"nickname_required", "nickname_too_long", "nickname_invalid", "invalid"}:
        data = result.get("data") or {}
        await message.answer(str(data.get("error") or "Такой ник не подходит. Введи другой игровой ник."))
        return

    await message.answer("Не удалось завершить регистрацию. Попробуй отправить ник ещё раз через минуту.")
