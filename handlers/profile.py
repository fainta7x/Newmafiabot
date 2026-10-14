import os
import time
from typing import Dict, Any, List, Tuple

from aiogram import Router, F, types
from aiogram.enums import ParseMode
from aiogram.types import FSInputFile, InlineKeyboardMarkup, InlineKeyboardButton
from aiogram.fsm.context import FSMContext
from aiogram.utils.keyboard import InlineKeyboardBuilder

import database
from database import (
    get_game_by_id,
    get_game_slots_by_date,
    get_night_kills_order,
    get_user_by_id,
)
from game.utils.endgame_pic import create_endgame_pic_summary

router = Router()

TEMP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "temp")
os.makedirs(TEMP_DIR, exist_ok=True)

from aiogram import BaseMiddleware
from aiogram.types import TelegramObject
from typing import Callable, Awaitable


# --- ЗАЩИТА РЕДАКТОРА ---
async def check_is_editor(user_id: int) -> bool:
    """Проверяет права на редактирование (админ/судья)"""

    # 1. Проверяем через твою базу данных, назначен ли человек судьей
    is_judge = await database.is_game_judge(user_id)
    if is_judge:
        return True

    # 2. Главные админы (создатель бота).
    # Впиши сюда свой Telegram ID, чтобы у тебя всегда был доступ,
    # даже если ты забыл назначить себя судьей через меню бота.
    admin_ids = [806709593] # исправила на id Чагина

    if user_id in admin_ids:
        return True

    return False


class EditorProtectionMiddleware(BaseMiddleware):
    """Мидлварь, которая блокирует ВСЕ действия редактора для обычных игроков"""

    async def __call__(
            self,
            handler: Callable[[TelegramObject, Dict[str, Any]], Awaitable[Any]],
            event: TelegramObject,
            data: Dict[str, Any]
    ) -> Any:
        user_id = None
        is_edit_action = False

        # Перехватываем нажатия на инлайн-кнопки редактора
        if isinstance(event, types.CallbackQuery) and event.data and event.data.startswith("editgame_"):
            user_id = event.from_user.id
            is_edit_action = True

        # Перехватываем текстовый ввод (когда бот просит ввести очки или фолы)
        elif isinstance(event, types.Message):
            state = data.get("state")
            if state:
                curr_state = await state.get_state()
                if curr_state and curr_state.startswith("EditGame"):
                    user_id = event.from_user.id
                    is_edit_action = True

        # Если это действие редактора — проверяем права
        if is_edit_action and user_id:
            if not await check_is_editor(user_id):
                if isinstance(event, types.CallbackQuery):
                    await event.answer("⛔ Доступ запрещен. Только администраторы и судьи могут редактировать игры.",
                                       show_alert=True)
                elif isinstance(event, types.Message):
                    await event.answer("⛔ У вас нет прав для редактирования.")
                return  # Жёстко прерываем выполнение!

        return await handler(event, data)


# Подключаем охранника к роутеру
router.callback_query.middleware(EditorProtectionMiddleware())
router.message.middleware(EditorProtectionMiddleware())


# -------------------------

# ======================= ВСПОМОГАТЕЛЬНОЕ =======================

def _cleanup_old_files(prefix: str, keep: int = 10):
    try:
        files = [
            os.path.join(TEMP_DIR, f)
            for f in os.listdir(TEMP_DIR)
            if f.startswith(prefix) and f.endswith(".png")
        ]
        files.sort(key=os.path.getmtime)
        for f in files[:-keep]:
            os.remove(f)
            print(f"[CLEANUP] Removed old file: {f}")
    except Exception as e:
        print(f"[CLEANUP] Error: {e}")














# ======================= FSM ДЛЯ ВВОДА ЗНАЧЕНИЙ =======================




# ======================= НОВЫЕ ФУНКЦИИ ДЛЯ НАВИГАЦИИ ПО ИГРАМ =======================

async def get_all_game_dates() -> List[Tuple[str, int]]:
    """Возвращает список дат, в которые были игры, и количество игр в эту дату"""
    async with database.get_db() as conn:
        async with conn.execute("""
            SELECT game_date, COUNT(*) as games_count
            FROM game_history
            GROUP BY game_date
            ORDER BY 
                CASE 
                    WHEN LENGTH(game_date) = 5 THEN substr(game_date, 4, 2) || substr(game_date, 1, 2)
                    ELSE substr(game_date, 7, 4) || substr(game_date, 4, 2) || substr(game_date, 1, 2)
                END ASC
        """) as cur:
            return await cur.fetchall()


def get_games_by_date_kb(dates: List[Tuple[str, int]], prefix: str) -> InlineKeyboardMarkup:
    """Клавиатура для выбора даты (с красивым отображением)"""
    builder = []
    for date_str, count in dates:
        # Конвертируем ISO дату в ДД.ММ.ГГГГ только для ТЕКСТА на кнопке
        display_date = database.format_date_to_user(date_str)

        builder.append([InlineKeyboardButton(
            text=f"📅 {display_date} ({count} игр)",
            callback_data=f"{prefix}_date:{date_str}"  # Внутри остается 2026-05-13 для поиска
        )])
    builder.append([InlineKeyboardButton(text="◀️ Назад", callback_data="back_to_games_menu")])
    return InlineKeyboardMarkup(inline_keyboard=builder)


def get_games_by_date_inline_kb(games: List[Dict], date_str: str, prefix: str) -> InlineKeyboardMarkup:
    """Клавиатура для выбора игры из конкретной даты"""
    builder = []
    for game in games:
        game_id = game["id"]
        game_number = game.get("game_number", "?")
        winner = game.get("winner_label", "")
        winner_icon = "🏙" if "город" in winner.lower() else "💀" if "мафи" in winner.lower() else "⚠️"
        builder.append([InlineKeyboardButton(
            text=f"🎮 №{game_number} {winner_icon}",
            callback_data=f"{prefix}_game:{game_id}"
        )])
    builder.append([InlineKeyboardButton(text="◀️ Назад к датам", callback_data=f"{prefix}_back_to_dates")])
    builder.append([InlineKeyboardButton(text="❌ Закрыть", callback_data="close_games")])
    return InlineKeyboardMarkup(inline_keyboard=builder)


# ======================= ОСНОВНЫЕ ХЕНДЛЕРЫ =======================



# ======================= ВСЕ ИГРЫ (НОВАЯ ЛОГИКА) =======================



@router.callback_query(F.data.startswith("allgames_date:"))
async def show_games_by_date(callback: types.CallbackQuery):
    """Показывает игры за выбранную дату"""
    date_str = callback.data.split(":", 1)[1]

    # Получаем игры за эту дату
    async with database.get_db() as conn:
        async with conn.execute("""
                                SELECT id, game_date, game_number, winner_label
                                FROM game_history
                                WHERE game_date = ?
                                ORDER BY game_number
                                """, (date_str,)) as cur:
            games = await cur.fetchall()

    games_list = [{"id": g[0], "game_date": g[1], "game_number": g[2], "winner_label": g[3]} for g in games]

    if not games_list:
        await callback.answer("Нет игр за эту дату", show_alert=True)
        return

    kb = get_games_by_date_inline_kb(games_list, date_str, "allgames")
    await callback.message.edit_text(
        f"📅 **Игры за {date_str}:**\n\nВыберите игру для просмотра протокола:",
        reply_markup=kb,
        parse_mode=ParseMode.MARKDOWN
    )
    await callback.answer()


@router.callback_query(F.data.startswith("allgames_game:"))
async def show_game_by_id(callback: types.CallbackQuery):
    """Показывает протокол выбранной игры"""
    game_id = int(callback.data.split(":", 1)[1])

    game = await get_game_by_id(game_id)
    if not game:
        await callback.answer("Игра не найдена", show_alert=True)
        return

    date_str = game.get("game_date") or "-"
    winner_label = game.get("winner_label") or "Результат не указан"
    game_number = game.get("game_number")
    global_game_number = game.get("global_game_number") or 0
    judge_id = game.get("judge_id")

    judge_name = None
    if judge_id:
        user_info = await get_user_by_id(judge_id)
        if user_info:
            _, full_name, username, nickname = user_info
            judge_name = nickname or full_name or username

    slots = await get_game_slots_by_date(date_str, game_number=game_number)
    if not slots:
        await callback.answer("Нет игр на этот вечер", show_alert=True)
        return

    night_kills_order = await get_night_kills_order(date_str, game_number or 0)
    filtered_order = []
    for slot_num in night_kills_order:
        if slot_num in slots:
            status_reason = slots[slot_num].get("status_reason", "")
            if "убит" in status_reason.lower() and "заголосован" not in status_reason.lower():
                filtered_order.append(slot_num)
    slots["_night_kills_order"] = filtered_order

    from game.text import build_protocol_text
    protocol_body = await build_protocol_text(slots, winner_label=winner_label)

    header = f"📑 Протокол игры №{game_number} ({date_str}): {winner_label}"
    if global_game_number:
        header += f" — №{global_game_number} по общей истории"

    if judge_name:
        full_text = f"{header}\n\n<b>Судья:</b> {judge_name}\n\n{protocol_body}"
    else:
        full_text = f"{header}\n\n{protocol_body}"

    # --- ПРАВИЛЬНАЯ ПРОВЕРКА ПРАВ И СБОРКА КНОПОК ---
    is_editor = await check_is_editor(callback.from_user.id)
    kb_buttons = []

    if is_editor:
        kb_buttons.append(
            [InlineKeyboardButton(text="✏️ Редактировать игру", callback_data=f"editgame_menu:{game_id}")])

    kb_buttons.append([InlineKeyboardButton(text="◀️ Назад к дате", callback_data=f"allgames_date:{date_str}")])
    kb_buttons.append([InlineKeyboardButton(text="❌ Закрыть", callback_data="close_games")])

    kb = InlineKeyboardMarkup(inline_keyboard=kb_buttons)
    # -------------------------------------------------

    timestamp = int(time.time())

    try:
        img_path = create_endgame_pic_summary(
            slots=slots, game_date=date_str,
            evening_game_number=game_number or 0,
            global_game_number=global_game_number or 0,
            winner_label=winner_label,
            judge_name=judge_name,
        )
        doc = FSInputFile(img_path)

        await callback.message.answer_document(document=doc, caption=None)
        await callback.message.answer(
            f"{full_text}\n\n🕐 Обновлено: {timestamp}",
            parse_mode=ParseMode.HTML,
            reply_markup=kb
        )
        _cleanup_old_files("endgame_summary_", keep=10)
    except Exception as e:
        print(f"[GAME_PROTOCOL][ERROR] {e}")
        await callback.message.answer(
            f"{full_text}\n\n🕐 Обновлено: {timestamp}",
            parse_mode=ParseMode.HTML,
            reply_markup=kb
        )

    await callback.answer()


# ======================= МОИ ИГРЫ (НОВАЯ ЛОГИКА) =======================



@router.callback_query(F.data.startswith("mygames_date:"))
async def show_my_games_by_date(callback: types.CallbackQuery):
    """Показывает игры пользователя за выбранную дату"""
    date_str = callback.data.split(":", 1)[1]
    user_id = callback.from_user.id

    async with database.get_db() as conn:
        async with conn.execute("""
                                SELECT DISTINCT g.id, g.game_date, g.game_number, g.winner_label
                                FROM game_history g
                                         JOIN game_slots_history s
                                              ON g.game_date = s.game_date AND g.game_number = s.game_number
                                WHERE s.user_id = ?
                                  AND g.game_date = ?
                                ORDER BY g.game_number
                                """, (user_id, date_str)) as cur:
            games = await cur.fetchall()

    games_list = [{"id": g[0], "game_date": g[1], "game_number": g[2], "winner_label": g[3]} for g in games]

    if not games_list:
        await callback.answer("Нет ваших игр за эту дату", show_alert=True)
        return

    kb = get_games_by_date_inline_kb(games_list, date_str, "mygames")
    await callback.message.edit_text(
        f"📅 **Ваши игры за {date_str}:**\n\nВыберите игру для просмотра протокола:",
        reply_markup=kb,
        parse_mode=ParseMode.MARKDOWN
    )
    await callback.answer()


@router.callback_query(F.data.startswith("mygames_game:"))
async def show_my_game_by_id(callback: types.CallbackQuery):
    """Показывает протокол выбранной игры пользователя"""
    game_id = int(callback.data.split(":", 1)[1])

    game = await get_game_by_id(game_id)
    if not game:
        await callback.answer("Игра не найдена", show_alert=True)
        return

    date_str = game.get("game_date") or "-"
    winner_label = game.get("winner_label") or "Результат не указан"
    game_number = game.get("game_number")
    global_game_number = game.get("global_game_number") or 0
    judge_id = game.get("judge_id")

    judge_name = None
    if judge_id:
        user_info = await get_user_by_id(judge_id)
        if user_info:
            _, full_name, username, nickname = user_info
            judge_name = nickname or full_name or username

    slots = await get_game_slots_by_date(date_str, game_number=game_number)
    if not slots:
        await callback.answer("Нет игр на этот вечер", show_alert=True)
        return

    night_kills_order = await get_night_kills_order(date_str, game_number or 0)
    filtered_order = []
    for slot_num in night_kills_order:
        if slot_num in slots:
            status_reason = slots[slot_num].get("status_reason", "")
            if "убит" in status_reason.lower() and "заголосован" not in status_reason.lower():
                filtered_order.append(slot_num)
    slots["_night_kills_order"] = filtered_order

    from game.text import build_protocol_text
    protocol_body = await build_protocol_text(slots, winner_label=winner_label)

    header = f"📑 Протокол игры №{game_number} ({date_str}): {winner_label}"
    if global_game_number:
        header += f" — №{global_game_number} по общей истории"

    if judge_name:
        full_text = f"{header}\n\n<b>Судья:</b> {judge_name}\n\n{protocol_body}"
    else:
        full_text = f"{header}\n\n{protocol_body}"

    # --- ПРАВИЛЬНАЯ ПРОВЕРКА ПРАВ И СБОРКА КНОПОК ---
    is_editor = await check_is_editor(callback.from_user.id)
    kb_buttons = []

    if is_editor:
        kb_buttons.append(
            [InlineKeyboardButton(text="✏️ Редактировать игру", callback_data=f"editgame_menu:{game_id}")])

    kb_buttons.append([InlineKeyboardButton(text="◀️ Назад к дате", callback_data=f"mygames_date:{date_str}")])
    kb_buttons.append([InlineKeyboardButton(text="❌ Закрыть", callback_data="close_games")])

    kb = InlineKeyboardMarkup(inline_keyboard=kb_buttons)
    # -------------------------------------------------

    timestamp = int(time.time())

    try:
        img_path = create_endgame_pic_summary(
            slots=slots, game_date=date_str,
            evening_game_number=game_number or 0,
            global_game_number=global_game_number or 0,
            winner_label=winner_label,
            judge_name=judge_name,
        )
        doc = FSInputFile(img_path)

        await callback.message.answer_document(document=doc, caption=None)
        await callback.message.answer(
            f"{full_text}\n\n🕐 Обновлено: {timestamp}",
            parse_mode=ParseMode.HTML,
            reply_markup=kb
        )
        _cleanup_old_files("endgame_summary_", keep=10)
    except Exception as e:
        print(f"[GAME_PROTOCOL][ERROR] {e}")
        await callback.message.answer(
            f"{full_text}\n\n🕐 Обновлено: {timestamp}",
            parse_mode=ParseMode.HTML,
            reply_markup=kb
        )

    await callback.answer()


@router.callback_query(F.data == "back_to_games_menu")
async def back_to_games_menu(callback: types.CallbackQuery):
    """Возврат к списку дат"""
    dates = await get_all_game_dates()
    if not dates:
        await callback.message.edit_text("📭 Пока нет завершённых игр.")
        await callback.answer()
        return

    kb = get_games_by_date_kb(dates, "allgames")
    try:
        await callback.message.edit_text(
            "📅 **Выберите дату,** чтобы посмотреть игры этого вечера:",
            reply_markup=kb,
            parse_mode=ParseMode.MARKDOWN
        )
    except Exception:
        # Игнорируем ошибку "message is not modified"
        pass
    await callback.answer()


@router.callback_query(F.data == "close_games")
async def close_games(callback: types.CallbackQuery):
    """Закрывает окно с играми"""
    await callback.message.delete()
    await callback.answer()


@router.callback_query(F.data.startswith("allgames_back_to_dates"))
async def allgames_back_to_dates(callback: types.CallbackQuery):
    """Возврат к списку дат из allgames"""
    dates = await get_all_game_dates()
    if not dates:
        await callback.message.edit_text("📭 Пока нет завершённых игр.")
        await callback.answer()
        return

    kb = get_games_by_date_kb(dates, "allgames")
    await callback.message.edit_text(
        "📅 **Выберите дату,** чтобы посмотреть игры этого вечера:",
        reply_markup=kb,
        parse_mode=ParseMode.MARKDOWN
    )
    await callback.answer()


@router.callback_query(F.data.startswith("mygames_back_to_dates"))
async def mygames_back_to_dates(callback: types.CallbackQuery):
    """Возврат к списку дат из mygames"""
    user_id = callback.from_user.id

    async with database.get_db() as conn:
        async with conn.execute("""
                                SELECT DISTINCT g.game_date, COUNT(*) as games_count
                                FROM game_history g
                                         JOIN game_slots_history s
                                              ON g.game_date = s.game_date AND g.game_number = s.game_number
                                WHERE s.user_id = ?
                                GROUP BY g.game_date
                                ORDER BY g.game_date DESC
                                """, (user_id,)) as cur:
            dates = await cur.fetchall()

    if not dates:
        await callback.message.edit_text("📭 У вас пока нет сыгранных игр.")
        await callback.answer()
        return

    kb = get_games_by_date_kb(dates, "mygames")
    await callback.message.edit_text(
        "📅 **Выберите дату,** чтобы посмотреть ваши игры в этот вечер:",
        reply_markup=kb,
        parse_mode=ParseMode.MARKDOWN
    )
    await callback.answer()


# ======================= ОСТАЛЬНЫЕ ФУНКЦИИ (MVP, РЕЙТИНГ, РЕДАКТИРОВАНИЕ) =======================

async def get_mvp() -> tuple:
    async with database.get_db() as conn:
        async with conn.execute("""
                                SELECT u.nickname,
                                       u.full_name,
                                       COALESCE(SUM(s.bonus_points + s.lh_points + s.will_protocol_points +
                                                    s.will_opinion_points + s.dc_points), 0) as total_bonus
                                FROM game_slots_history s
                                         JOIN users u ON s.user_id = u.user_id
                                GROUP BY s.user_id
                                HAVING total_bonus > 0
                                ORDER BY total_bonus DESC
                                LIMIT 1
                                """) as cur:
            row = await cur.fetchone()
            if row:
                name = row[0] or row[1] or "Неизвестный"
                return name, round(row[2], 1)
    return None, 0


async def get_best_by_role(role_name: str) -> tuple:
    async with database.get_db() as conn:
        async with conn.execute("""
                                SELECT u.nickname,
                                       u.full_name,
                                       COALESCE(SUM(s.bonus_points + s.lh_points + s.will_protocol_points +
                                                    s.will_opinion_points + s.dc_points), 0) as total_bonus
                                FROM game_slots_history s
                                         JOIN users u ON s.user_id = u.user_id
                                WHERE s.role = ?
                                GROUP BY s.user_id
                                HAVING total_bonus > 0
                                ORDER BY total_bonus DESC
                                LIMIT 1
                                """, (role_name,)) as cur:
            row = await cur.fetchone()
            if row:
                name = row[0] or row[1] or "Неизвестный"
                return name, round(row[2], 1)
    return None, 0




def build_compact_rating_page(players: list, page: int, total_pages: int, total_players: int, mvp_data: tuple,
                              roles_data: dict) -> str:
    """Генерирует компактный и красивый текст для страницы рейтинга."""
    lines = [
        f"🏆 **РЕЙТИНГ ЭЛО** • Страница {page}/{total_pages}",
        f"👥 Всего игроков: {total_players}\n",
        "```"  # Начинаем моноширинный блок для основного рейтинга
    ]

    for p in players:
        pos = p["place"]
        name = p["nickname"] or "Неизвестный"
        elo = p["elo"]
        games = p["games_played"]
        wins = p["games_won"]
        winrate = int((wins / games * 100)) if games > 0 else 0

        icon = f"{pos:2}."
        name_pad = name[:12].ljust(12)
        games_pad = f"{games:>2}"
        wins_pad = f"{wins:>2}"
        win_pad = f"{winrate:>3}"

        lines.append(f"{icon} {name_pad} • {elo} ⚜️ | Игр: {games_pad} | Побед: {wins_pad} ({win_pad}%)")

    lines.append("```\n")

    # Показываем номинации только на первой странице
    if page == 1:
        mvp_name, mvp_score = mvp_data
        if mvp_name and mvp_score > 0:
            lines.append(f"🌟 **MVP (Общий Доп):** {mvp_name} (+{mvp_score})\n")

        if roles_data:
            lines.append("🎭 **Лучшие по ролям:**")
            lines.append("```")  # Открываем второй моноширинный блок для ролей

            # Строгий порядок ролей
            for role_name in ["Мирный", "Шериф", "Мафия", "Дон"]:
                if role_name in roles_data:
                    name, score = roles_data[role_name]

                    # Выравнивание: Роль (6 символов), Имя (12 символов)
                    role_pad = role_name.ljust(6)
                    name_pad = name[:12].ljust(12)
                    score_pad = f"+{score:.1f}"

                    lines.append(f"{role_pad} | {name_pad} | {score_pad}")

            lines.append("```")

    return "\n".join(lines)




async def show_rating_page_from_callback(callback: types.CallbackQuery, page: int, rating: list):
    """Показывает страницу рейтинга (Редактирование сообщения по кнопке)"""
    page_size = 10
    total_players = len(rating)
    total_pages = (total_players + page_size - 1) // page_size
    start_idx = page * page_size
    end_idx = min(start_idx + page_size, total_players)
    current_page_players = rating[start_idx:end_idx]

    mvp_data = await get_mvp() if page == 0 else (None, 0)
    roles_data = {}
    if page == 0:
        for role_name in ["Мирный", "Шериф", "Мафия", "Дон"]:
            best_name, best_bonus = await get_best_by_role(role_name)
            if best_name and best_bonus > 0:
                # Теперь мы сохраняем и имя, и баллы!
                roles_data[role_name] = (best_name, best_bonus)

    text = build_compact_rating_page(
        players=current_page_players,
        page=page + 1,
        total_pages=total_pages,
        total_players=total_players,
        mvp_data=mvp_data,
        roles_data=roles_data
    )

    builder = InlineKeyboardBuilder()
    if page > 0:
        builder.button(text="◀️ Назад", callback_data=f"rating_page:{page - 1}")
    if page < total_pages - 1:
        builder.button(text="Вперед ▶️", callback_data=f"rating_page:{page + 1}")

    builder.button(text="ℹ️ Как считается рейтинг?", callback_data="rating_rules")
    builder.button(text="❌ Закрыть", callback_data="rating_close")

    if page > 0 and page < total_pages - 1:
        builder.adjust(2, 1, 1)
    else:
        builder.adjust(1, 1, 1)

    await callback.message.edit_text(text, parse_mode=ParseMode.MARKDOWN, reply_markup=builder.as_markup())
    await callback.answer()


@router.callback_query(F.data.startswith("rating_page:"))
async def rating_page_callback(callback: types.CallbackQuery):
    """Обработчик переключения страниц рейтинга"""
    page = int(callback.data.split(":")[1])

    if not hasattr(callback.bot, "rating_cache") or callback.message.chat.id not in callback.bot.rating_cache:
        await callback.answer("Данные устарели, нажмите '🏆 Рейтинг' заново", show_alert=True)
        return

    rating = callback.bot.rating_cache[callback.message.chat.id]
    await show_rating_page_from_callback(callback, page, rating)


async def show_rating_page_from_callback(callback: types.CallbackQuery, page: int, rating: list):
    """Показывает страницу рейтинга (Редактирование сообщения по кнопке)"""
    page_size = 10
    total_players = len(rating)
    total_pages = (total_players + page_size - 1) // page_size
    start_idx = page * page_size
    end_idx = min(start_idx + page_size, total_players)
    current_page_players = rating[start_idx:end_idx]

    mvp_data = await get_mvp() if page == 0 else (None, 0)
    roles_data = {}
    if page == 0:
        for role_name in ["Мирный", "Шериф", "Мафия", "Дон"]:
            best_name, best_bonus = await get_best_by_role(role_name)
            if best_name and best_bonus > 0:
                roles_data[role_name] = best_name

    text = build_compact_rating_page(
        players=current_page_players,
        page=page + 1,
        total_pages=total_pages,
        total_players=total_players,
        mvp_data=mvp_data,
        roles_data=roles_data
    )

    builder = InlineKeyboardBuilder()
    if page > 0:
        builder.button(text="◀️ Назад", callback_data=f"rating_page:{page - 1}")
    if page < total_pages - 1:
        builder.button(text="Вперед ▶️", callback_data=f"rating_page:{page + 1}")

    builder.button(text="ℹ️ Как считается рейтинг?", callback_data="rating_rules")
    builder.button(text="❌ Закрыть", callback_data="rating_close")

    if page > 0 and page < total_pages - 1:
        builder.adjust(2, 1, 1)
    else:
        builder.adjust(1, 1, 1)

    await callback.message.edit_text(text, parse_mode=ParseMode.MARKDOWN, reply_markup=builder.as_markup())
    await callback.answer()


@router.callback_query(F.data == "rating_rules")
async def rating_rules_callback(callback: types.CallbackQuery):
    """Показывает всплывающее окно с правилами рейтинга"""
    rules = (
        "🏆 ФОРМУЛА ЭЛО:\n"
        "1. За сильных соперников дают больше.\n"
        "2. Баланс: Красным сложнее (получают больше, теряют меньше).\n"
        "3. Допы: дают плюс к Эло.\n"
        "4. Carry: если 'тащил', теряешь меньше."
    )
    await callback.answer(rules, show_alert=True)


@router.callback_query(F.data == "rating_close")
async def rating_close(callback: types.CallbackQuery):
    """Закрывает окно с рейтингом"""
    await callback.message.delete()
    await callback.answer()




# ======================= ОСТАЛЬНЫЕ ХЕНДЛЕРЫ РЕДАКТИРОВАНИЯ =======================



@router.callback_query(F.data.startswith(("allgames:", "mygames:")))
async def show_game_protocol(callback: types.CallbackQuery, state: FSMContext):
    try:
        prefix, game_id_str = callback.data.split(":", 1)
        game_id = int(game_id_str)
    except Exception as e:
        print(f"[GAME_PROTOCOL][ERROR] Parse error: {e}")
        await callback.answer("Некорректные данные игры.", show_alert=True)
        return

    game = await get_game_by_id(game_id)
    if not game:
        await callback.answer("Игра не найдена.", show_alert=True)
        return

    date_str = game.get("game_date") or "-"
    winner_label = game.get("winner_label") or "Результат не указан"
    game_number = game.get("game_number")
    global_game_number = game.get("global_game_number") or 0
    judge_id = game.get("judge_id")

    judge_name = None
    if judge_id:
        user_info = await get_user_by_id(judge_id)
        if user_info:
            _, full_name, username, nickname = user_info
            judge_name = nickname or full_name or username

    slots = await get_game_slots_by_date(date_str, game_number=game_number)
    if not slots:
        await callback.answer("Нет игр на этот вечер.", show_alert=True)
        return

    night_kills_order = await get_night_kills_order(date_str, game_number or 0)
    filtered_order = []
    for slot_num in night_kills_order:
        if slot_num in slots:
            status_reason = slots[slot_num].get("status_reason", "")
            if "убит" in status_reason.lower() and "заголосован" not in status_reason.lower():
                filtered_order.append(slot_num)
    slots["_night_kills_order"] = filtered_order

    from game.text import build_protocol_text
    protocol_body = await build_protocol_text(slots, winner_label=winner_label)

    header = f"📑 Протокол игры №{game_number} ({date_str}): {winner_label}"
    if global_game_number:
        header += f" — №{global_game_number} по общей истории"

    if judge_name:
        full_text = f"{header}\n\n<b>Судья:</b> {judge_name}\n\n{protocol_body}"
    else:
        full_text = f"{header}\n\n{protocol_body}"

    # --- ПРАВИЛЬНАЯ ПРОВЕРКА ПРАВ И СБОРКА КНОПОК ---
    is_editor = await check_is_editor(callback.from_user.id)
    kb_buttons = []

    if is_editor:
        kb_buttons.append(
            [InlineKeyboardButton(text="✏️ Редактировать игру", callback_data=f"editgame_menu:{game_id}")])

    kb = InlineKeyboardMarkup(inline_keyboard=kb_buttons) if kb_buttons else None
    # -------------------------------------------------

    timestamp = int(time.time())

    try:
        img_path = create_endgame_pic_summary(
            slots=slots, game_date=date_str,
            evening_game_number=game_number or 0,
            global_game_number=global_game_number or 0,
            winner_label=winner_label,
            judge_name=judge_name,
        )
        doc = FSInputFile(img_path)

        await callback.message.answer_document(document=doc, caption=None)
        await callback.message.answer(f"{full_text}\n\n🕐 Обновлено: {timestamp}", parse_mode=ParseMode.HTML,
                                      reply_markup=kb)
        _cleanup_old_files("endgame_summary_", keep=10)
    except Exception as e:
        print(f"[GAME_PROTOCOL][ERROR] {e}")
        await callback.message.answer(f"{full_text}\n\n🕐 Обновлено: {timestamp}", parse_mode=ParseMode.HTML,
                                      reply_markup=kb)

    await callback.answer()


# ======================= ГЛАВНОЕ МЕНЮ РЕДАКТИРОВАНИЯ =======================





# ======================= ПОКАЗАТЬ АКТУАЛЬНЫЙ ПРОТОКОЛ =======================



# ======================= РЕДАКТИРОВАНИЕ ИГРОКОВ =======================





# ======================= РЕДАКТИРОВАНИЕ ИСХОДА =======================

























# ======================= УПРАВЛЕНИЕ ФОЛАМИ =======================

















# ======================= УДАЛЕНИЕ ИГРЫ =======================




# ======================= ЗАМЕНА ИГРОКА В СЛОТЕ =======================



