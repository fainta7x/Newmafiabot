from aiogram import F, Router
from aiogram.filters import Command, CommandObject
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

import bot_menu
import config
import database
from bot_profile_link_api import (
    claim_profile_by_link,
    get_canonical_profile,
    link_legacy_profile,
    register_canonical_profile,
    request_profile_link,
)
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


async def _handle_club_access(message: Message, kb, user=None) -> None:
    # From an inline button the message belongs to the bot; the caller passes who pressed it.
    user = user or message.from_user
    canonical = await get_canonical_profile(user.id)
    if not canonical.get("success"):
        await message.answer(
            "Чтобы проверить доступ в основной клуб, сначала нужен профиль игрока. "
            "Открой /start и заверши регистрацию.",
            reply_markup=kb,
        )
        return

    player = (canonical.get("data") or {}).get("player") or {}
    level = str(player.get("game_level") or "novice").strip().lower()
    nickname = str(player.get("nickname") or user.full_name or "Игрок")

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

    if user.id not in _club_access_requests and config.ADMIN_IDS:
        _club_access_requests.add(user.id)
        username = f"@{user.username}" if user.username else "без @username"
        try:
            await message.bot.send_message(
                config.ADMIN_IDS[0],
                "🎭 <b>Запрос на допуск в основной клуб</b>\n\n"
                f"Игрок: <b>{nickname}</b>\n"
                f"Telegram: {username}\n"
                f"ID: <code>{user.id}</code>\n"
                f"Текущий уровень: <code>{level}</code>\n\n"
                "Если игрок подходит для основного клуба — измени ему игровой уровень в кабинете организатора. "
                "До этого ссылка на основной клуб ему не выдаётся.",
                parse_mode="HTML",
            )
        except Exception:
            pass

    text = (
        "🔒 <b>Доступ в основной клуб пока не открыт.</b>\n\n"
        "Основной клуб доступен только после подтверждения организатора. "
        "Запрос на допуск отправлен.\n\n"
        "Пока можешь присоединиться к группе «Игры для новичков» — там проходят игры для новичков и тех, кто ещё знакомится с нашим клубом."
    )
    await message.answer(
        text,
        parse_mode="HTML",
        reply_markup=_url_keyboard("🌱 Вступить в «Игры для новичков»", novice_url) or kb,
    )


async def _send_normal_start(
    message: Message,
    command: CommandObject | None = None,
    *,
    args_override: str | None = None,
):
    args = args_override if args_override is not None else ((command.args or "").strip() if command else "")
    kb = await _main_menu(message.from_user.id)

    if args.startswith("event_"):
        evening_id = args.removeprefix("event_").strip()
        event_kb = bot_menu.event_inline_keyboard(evening_id) if evening_id else None
        # An old link to an evening that is over or cancelled: say so and offer the nearest one (owner, 2026-10-05).
        from bot_api import get_open_evenings
        opened = await get_open_evenings()
        open_list = opened.get("data") if opened.get("success") else None
        if isinstance(open_list, list) and (not evening_id or evening_id not in {str(item.get("id")) for item in open_list}):
            from handlers.bot_home import stale_link_view
            text, markup = stale_link_view(open_list, event_gone=True)
            await message.answer(text, parse_mode="HTML", reply_markup=markup)
            return
        if event_kb:
            await message.answer(
                "🎯 <b>Запись на игровой вечер</b>\n\n"
                "Открой вечер и отметь конкретные игры, на которые придёшь. "
                "Сумма к оплате посчитается автоматически.",
                parse_mode="HTML",
                reply_markup=event_kb,
            )
        else:
            await message.answer(
                "⚠️ Не удалось открыть этот вечер в приложении. Открой 2LA Noire из главного меню.",
                reply_markup=kb,
            )
        return

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

    # An unknown payload is an old link that leads nowhere: tell the player, then show the usual menu.
    from handlers.bot_home import is_known_start_payload
    if not is_known_start_payload(args):
        from bot_api import get_open_evenings
        opened = await get_open_evenings()
        from handlers.bot_home import stale_link_view
        text, markup = stale_link_view(opened.get("data") if opened.get("success") else None)
        await message.answer(text, parse_mode="HTML", reply_markup=markup)

    # The keyboard message first, then the menu card, so the card stays at the bottom of the chat.
    await message.answer(
        bot_menu.start_text(message.from_user.first_name if message.from_user else None, is_organizer=message.from_user.id in config.ADMIN_IDS),
        parse_mode="HTML",
        reply_markup=kb,
    )
    from handlers.bot_home import send_home
    await send_home(message)


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
    from handlers.bot_home import send_home
    await send_home(message)


@router.message(Command("start"), F.chat.type == "private")
async def start_with_registration(message: Message, command: CommandObject, state: FSMContext):
    if not message.from_user:
        return

    # Canonical registration/linking lives in the Node product DB. Do not mirror
    # every /start into the legacy Python users table; keep legacy access read-only
    # only for one-time recovery of an existing historical nickname.
    args = (command.args or "").strip()
    canonical = await get_canonical_profile(message.from_user.id)

    # «Ссылка для привязки» from the organizer (owner, 2026-09-30): link this Telegram to that profile at once.
    if args.startswith(CLAIM_START_PREFIX):
        await state.clear()
        if canonical.get("success"):
            player = (canonical.get("data") or {}).get("player") or {}
            await message.answer(
                f"Твой Telegram уже привязан к профилю «{player.get('nickname') or 'игрок'}». "
                "Если это ошибка — напиши организатору."
            )
            await _send_normal_start(message, args_override="")
            return
        claimed = await claim_profile_by_link(message.from_user.id, args[len(CLAIM_START_PREFIX):])
        if claimed.get("success"):
            player = (claimed.get("data") or {}).get("player") or {}
            await message.answer(f"✅ Готово! Профиль «{player.get('nickname') or 'игрок'}» привязан к твоему Telegram.")
            await _send_normal_start(message, args_override="")
            return
        await message.answer(
            f"⚠️ {claimed.get('message') or 'Не получилось привязать профиль по этой ссылке.'}\n"
            "Попроси у организатора новую ссылку."
        )
        return

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
        invited_by=pending_start_arg.removeprefix(INVITE_START_PREFIX) if pending_start_arg.startswith(INVITE_START_PREFIX) else None,
    )

    if result.get("success"):
        player = (result.get("data") or {}).get("player") or {}
        registered_nickname = str(player.get("nickname") or nickname)
        await state.clear()
        await message.answer(
            f"✅ Готово! Профиль «{registered_nickname}» создан и привязан к твоему Telegram.\n\n"
            "Следующий шаг — первая заявка: открой приложение → «События» и выбери "
            "«Я новичок» или «Я уже умею играть». Организатор подтвердит её, и ты сможешь "
            "сам записываться на вечера. Новичкам первые два вечера бесплатно."
        )
        await _send_normal_start(message, args_override=pending_start_arg)
        return

    error = result.get("error")
    if error == "nickname_taken" and (result.get("data") or {}).get("claimable") is False:
        # The profile already has its own Telegram or VK: a different player, no request to the organizer.
        await message.answer(
            f"Ник «{nickname}» уже занят игроком со своим аккаунтом. Придумай другой ник и пришли его одним сообщением."
        )
        return
    if error == "nickname_taken":
        # Keep the nickname: «Это мой профиль» sends it to the organizer as a link request.
        await state.set_state(None)
        await state.update_data(taken_nickname=nickname)
        await message.answer(
            f"В клубе уже есть игрок «{nickname}». Это твой профиль?",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text="Да, это я", callback_data="profile_claim:yes")],
                [InlineKeyboardButton(text="Нет, выберу другой ник", callback_data="profile_claim:no")],
            ]),
        )
        return
    if error in {"nickname_required", "nickname_too_long", "nickname_invalid", "invalid"}:
        data = result.get("data") or {}
        await message.answer(str(data.get("error") or "Такой ник не подходит. Введи другой игровой ник."))
        return

    await message.answer("Не удалось завершить регистрацию. Попробуй отправить ник ещё раз через минуту.")


CLAIM_START_PREFIX = "claim_"
# A friend's «Позвать друга» link from the game result card (gameResultCardService.ts).
INVITE_START_PREFIX = "ref_"


@router.callback_query(F.data.in_({"profile_claim:yes", "profile_claim:no"}))
async def answer_taken_nickname(callback: CallbackQuery, state: FSMContext):
    """The nickname is taken: link request to the organizer, or pick another nickname."""
    if not callback.from_user or not callback.message:
        return
    await callback.answer()
    if callback.data == "profile_claim:no":
        await state.set_state(RegistrationForm.waiting_for_nickname)
        await callback.message.answer("Хорошо. Пришли другой игровой ник одним сообщением.")
        return
    data = await state.get_data()
    nickname = str(data.get("taken_nickname") or "").strip()
    if not nickname:
        await state.set_state(RegistrationForm.waiting_for_nickname)
        await callback.message.answer("Пришли свой игровой ник ещё раз одним сообщением.")
        return
    result = await request_profile_link(callback.from_user.id, nickname)
    await state.clear()
    if result.get("success"):
        payload = result.get("data") or {}
        if payload.get("status") == "linked":
            await callback.message.answer("✅ Твой Telegram уже привязан к профилю. Открой /start.")
            return
        await callback.message.answer(
            f"📨 Отправил организатору запрос: привязать профиль «{payload.get('nickname') or nickname}» к твоему Telegram. "
            "Как только он подтвердит, профиль откроется здесь и в приложении."
        )
        return
    if result.get("error") in {"nickname_linked_elsewhere", "target_telegram_conflict"}:
        # The profile already belongs to someone with their own Telegram: this is a different player.
        await state.set_state(RegistrationForm.waiting_for_nickname)
        await callback.message.answer(
            f"Ник «{nickname}» уже занят игроком со своим аккаунтом. "
            "Придумай другой ник и пришли его одним сообщением."
        )
        return
    await callback.message.answer(
        f"⚠️ {result.get('message') or 'Не получилось отправить запрос.'} Напиши организатору — он привяжет профиль сам."
    )
