from aiogram import F, Router
from aiogram.filters import Command, CommandObject
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import Message

import config
import database
import keyboards
from bot_profile_link_api import get_canonical_profile, link_legacy_profile, register_canonical_profile
from handlers.booking import build_stats_text, get_next_friday

router = Router()


class RegistrationForm(StatesGroup):
    waiting_for_nickname = State()


async def _is_judge(user_id: int) -> bool:
    if user_id in config.ADMIN_IDS:
        return True
    return user_id in await database.get_game_judges()


async def _main_menu(user_id: int):
    is_admin = user_id in config.ADMIN_IDS
    is_judge = await _is_judge(user_id)
    if is_admin:
        return keyboards.main_menu_admin()
    if is_judge:
        return keyboards.main_menu_judge()
    return keyboards.main_menu()


async def _send_normal_start(message: Message, command: CommandObject | None = None):
    args = (command.args or "").strip() if command else ""
    kb = await _main_menu(message.from_user.id)

    if args == "players":
        date_str = get_next_friday()
        await message.answer(await build_stats_text(date_str), reply_markup=kb)
        return

    if args.startswith("profile_"):
        target_id = args.replace("profile_", "")
        from handlers.start_profile import show_other_profile
        await show_other_profile(message, target_id)
        return

    date = get_next_friday()
    await message.answer(
        f"🎭 Привет! Ближайшая игра {date} в 20:00",
        reply_markup=kb,
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

    canonical = await get_canonical_profile(message.from_user.id)
    if canonical.get("success"):
        await state.clear()
        await _send_normal_start(message, command)
        return

    if canonical.get("error") != "not_found":
        # Preserve legacy bot usability if the web backend is temporarily unavailable.
        await state.clear()
        await message.answer("⚠️ Новая клубная база временно недоступна, но бот продолжает работать.")
        await _send_normal_start(message, command)
        return

    # Existing legacy users with a saved nickname can be migrated without creating a duplicate.
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
    await message.answer(
        "🎭 Добро пожаловать в 2LA noire!\n\n"
        "Чтобы зарегистрироваться, пришлите одним сообщением свой игровой ник. "
        "Он будет отображаться в записях, играх, рейтингах и турнирах.\n\n"
        "Если вы уже играли в клубе и ваш профиль точно есть в нашей базе, не создавайте новый — напишите организатору для привязки существующего профиля."
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
        await message.answer("Пришлите игровой ник текстом.")
        return
    if len(nickname) > 60:
        await message.answer("Ник слишком длинный. Максимум 60 символов.")
        return

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
            f"✅ Готово! Профиль «{registered_nickname}» создан и привязан к вашему Telegram."
        )
        await _send_normal_start(message)
        return

    error = result.get("error")
    if error == "nickname_taken":
        await state.clear()
        await message.answer(
            "Игрок с таким ником уже есть в клубе. Новый профиль я не создаю, чтобы не сделать дубль. "
            "Если это ваш старый профиль — напишите организатору, он привяжет его к вашему Telegram."
        )
        return
    if error in {"nickname_required", "nickname_too_long", "nickname_invalid", "invalid"}:
        data = result.get("data") or {}
        await message.answer(str(data.get("error") or "Такой ник не подходит. Введите другой игровой ник."))
        return

    await message.answer("Не удалось завершить регистрацию. Попробуйте отправить ник ещё раз через минуту.")
