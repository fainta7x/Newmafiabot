from aiogram import F, Router
from aiogram.types import CallbackQuery, Message

import bot_menu
import config

router = Router()

_PLAYER_LEGACY_TEXTS = {
    "🕵️ Записаться на игру",
    "🧾 Список игроков",
    "👤 Мой профиль",
    "💳 Оплатить",
    "📊 Статистика",
    "📜 Мои игры",
    "📜 Все игры",
    "🏆 Рейтинг",
    "🏆 Рейтинг (старый)",
    "🛒 Магазин",
    "⚖ Панель судьи",
    "/shop",
    "✏️ Редактировать",
}

_ADMIN_LEGACY_TEXTS = {
    "👥 Все пользователи",
    "💰 Должники",
    "📣 Сделать анонс",
    "💸 Разослать счета",
    "📚 История вечеров",
    "❌ Отменить вечер",
    "⚖ Судьи",
    "Убить",
    "Голоса",
    "Выставить",
    "Фол",
    "⏹ Остановить",
    "🏁 Завершить",
    "♻️ Продолжить игру",
    "🎲 Новая игра",
}

_PLAYER_LEGACY_CALLBACK_PREFIXES = (
    "book_",
    "announce_confirm_",
    "check_",
    "pay_now",
    "bet_red:",
    "bet_black:",
    "bet_skip:",
    "bet_cancel",
    "shop_buy:",
    "shop_confirm:",
    "shop_my_tokens",
    "shop_back",
    "shop_close",
    "edit_nickname",
    "profile_pay",
    "edit_slot_",
    "role_set_",
    "team_set_",
    "status_set_",
    "edit_fouls_",
    "fouls_kick_",
    "fouls_small_",
    "fouls_big_",
    "fouls_dec_",
    "edit_role",
    "edit_team",
    "edit_status",
    "edit_pu",
    "pu_confirm_yes",
    "edit_lh",
    "edit_protocol_points",
    "edit_protocol_text",
    "edit_opinion_points",
    "edit_opinion_text",
    "edit_clear_all",
    "clear_confirm_yes",
    "edit_back_to_slots",
    "edit_back_to_menu",
    "edit_close",
)

_ADMIN_LEGACY_CALLBACK_PREFIXES = (
    "conf_",
    "decl_",
    "editdebt_",
    "hist_",
    "yr_",
    "mo_",
    "back_years",
    "back_months_",
    "back_to_month_",
    "editgame_",
    "admin_evenings_history",
    "judge_list",
    "judge_add",
    "judge_confirm_add_",
    "judge_cancel_add",
    "judge_remove_",
    "judge_back",
    "numeric_back",
    "numeric_clear",
    "numeric_done",
    "num_toggle_",
    "kill_cancel",
    "kill_protocol_skip",
    "kill_opinion_skip",
    "kill_back_to_",
    "kill_show_numeric_kb",
    "kill_select_",
    "split:",
    "nominate_cancel",
    "nominate_confirm",
    "vote_set_",
    "nominate_toggle_",
    "score_cancel",
    "score_finish",
    "score_back_to_values",
    "score_back_to_types",
    "score_back_to_players",
    "score_val_",
    "score_type_",
    "score_edit_",
    "game_end:",
    "ppk_back_to_teams",
    "ppk_cancel",
    "ppk_confirm_yes",
    "ppk_culprit_",
    "ppk_team_",
    "foul_cancel",
    "kick_player_",
    "tech_foul_big_",
    "tech_foul_small_",
    "foul_remove_",
    "foul_add_",
    "foul_select_",
    "edit_players_done",
    "game_confirm_edit",
    "game_confirm_no",
    "game_confirm_skip_judge",
    "game_confirm_yes",
    "game_ask_judge_manual",
    "game_cancel_judge",
    "game_choose_judge",
    "select_sheriff_",
    "select_don_",
    "select_mafia_",
    "game_set_judge:",
)


def _is_admin(user_id: int) -> bool:
    return user_id in config.ADMIN_IDS


async def _send_player_app(message: Message) -> None:
    keyboard = bot_menu.app_inline_keyboard()
    if keyboard:
        await message.answer(
            "Эта старая кнопка больше не меняет клубные данные через legacy-бота. "
            "Открой актуальный 2LA Noire — запись, профиль, рейтинг, кошелёк и магазин находятся там.",
            reply_markup=keyboard,
        )
    else:
        await message.answer("Эта старая функция отключена. Открой 2LA Noire из актуального главного меню.")


async def _send_admin_crm(message: Message) -> None:
    keyboard = bot_menu.app_inline_keyboard("/admin", text="🗂 Открыть CRM")
    if keyboard:
        await message.answer(
            "Эта старая админ-функция больше не пишет в legacy-базу. "
            "Используй актуальную CRM организатора.",
            reply_markup=keyboard,
        )
    else:
        await message.answer("Эта старая админ-функция отключена. Используй /crm.")


@router.message(F.text.in_(_PLAYER_LEGACY_TEXTS), F.chat.type == "private")
async def retire_legacy_player_menu(message: Message):
    await _send_player_app(message)


@router.message(F.text.in_(_ADMIN_LEGACY_TEXTS), F.chat.type == "private")
async def retire_legacy_admin_menu(message: Message):
    if not message.from_user or not _is_admin(message.from_user.id):
        return
    await _send_admin_crm(message)


@router.callback_query(F.data.startswith(_PLAYER_LEGACY_CALLBACK_PREFIXES))
async def retire_legacy_player_callback(callback: CallbackQuery):
    await callback.answer("Эта старая кнопка отключена. Открой актуальное приложение.", show_alert=True)
    if callback.message:
        await _send_player_app(callback.message)


@router.callback_query(F.data.startswith(_ADMIN_LEGACY_CALLBACK_PREFIXES))
async def retire_legacy_admin_callback(callback: CallbackQuery):
    if not callback.from_user or not _is_admin(callback.from_user.id):
        await callback.answer("Эта старая кнопка больше не используется.", show_alert=True)
        return
    await callback.answer("Старая админ-функция отключена. Открой CRM.", show_alert=True)
    if callback.message:
        await _send_admin_crm(callback.message)
