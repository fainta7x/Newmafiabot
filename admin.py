
from aiogram import Router, types, F, Bot
from aiogram.types import Message
from aiogram.enums import ParseMode
import config
import database
import keyboards
from handlers.booking import build_stats_text, get_next_friday

router = Router()
bot: Bot | None = None

# Константы для Эло
STARTING_ELO = 1500

# Категории ачивок
ACHIEVEMENTS = {
    # ========== ИГРОВЫЕ (games) ==========
    "first_game": {"name": "Первая игра", "description": "Сыграть первую игру", "icon": "🎭", "type": "games",
                   "value": 1},
    "ten_games": {"name": "Новичок", "description": "Сыграть 10 игр", "icon": "🌟", "type": "games", "value": 10},
    "twenty_games": {"name": "Любитель", "description": "Сыграть 20 игр", "icon": "🎲", "type": "games", "value": 20},
    "thirty_games": {"name": "Завсегдатай", "description": "Сыграть 30 игр", "icon": "🎯", "type": "games", "value": 30},
    "fifty_games": {"name": "Опытный игрок", "description": "Сыграть 50 игр", "icon": "⚡", "type": "games",
                    "value": 50},
    "seventy_games": {"name": "Профи", "description": "Сыграть 70 игр", "icon": "🎓", "type": "games", "value": 70},
    "hundred_games": {"name": "Ветеран", "description": "Сыграть 100 игр", "icon": "🔥", "type": "games", "value": 100},
    "one_fifty_games": {"name": "Мастер", "description": "Сыграть 150 игр", "icon": "🏆", "type": "games", "value": 150},
    "two_hundred_games": {"name": "Легенда", "description": "Сыграть 200 игр", "icon": "👑", "type": "games",
                          "value": 200},

    # ========== ПОБЕДНЫЕ (wins) ==========
    "first_win": {"name": "Первая победа", "description": "Одержать первую победу", "icon": "🏆", "type": "wins",
                  "value": 1},
    "five_wins": {"name": "Первые успехи", "description": "Одержать 5 побед", "icon": "🌱", "type": "wins", "value": 5},
    "ten_wins": {"name": "Серийный победитель", "description": "Одержать 10 побед", "icon": "🎯", "type": "wins",
                 "value": 10},
    "twenty_wins": {"name": "Закалка", "description": "Одержать 20 побед", "icon": "⚔️", "type": "wins", "value": 20},
    "thirty_wins": {"name": "Победный дух", "description": "Одержать 30 побед", "icon": "🎖️", "type": "wins",
                    "value": 30},
    "forty_wins": {"name": "Покоритель", "description": "Одержать 40 побед", "icon": "⭐", "type": "wins", "value": 40},
    "fifty_wins": {"name": "Мастер побед", "description": "Одержать 50 побед", "icon": "🏅", "type": "wins",
                   "value": 50},
    "seventy_wins": {"name": "Герой", "description": "Одержать 70 побед", "icon": "🦸", "type": "wins", "value": 70},
    "hundred_wins": {"name": "Легенда побед", "description": "Одержать 100 побед", "icon": "🏅", "type": "wins",
                     "value": 100},

    # ========== РЕЙТИНГОВЫЕ (rating) ==========
    "elo_1400": {"name": "Начало пути", "description": "Достичь рейтинга Эло 1400", "icon": "🌱", "type": "rating",
                 "value": 1400},
    "elo_1500": {"name": "Старт", "description": "Достичь рейтинга Эло 1500", "icon": "🌱", "type": "rating",
                 "value": 1500},
    "elo_1550": {"name": "Бронзовый рейтинг", "description": "Достичь рейтинга Эло 1550", "icon": "🥉", "type": "rating",
                 "value": 1550},
    "elo_1600": {"name": "Серебряный рейтинг", "description": "Достичь рейтинга Эло 1600", "icon": "⭐",
                 "type": "rating", "value": 1600},
    "elo_1650": {"name": "Золотой рейтинг", "description": "Достичь рейтинга Эло 1650", "icon": "⭐", "type": "rating",
                 "value": 1650},
    "elo_1700": {"name": "Платиновый рейтинг", "description": "Достичь рейтинга Эло 1700", "icon": "🏅",
                 "type": "rating", "value": 1700},
    "elo_1750": {"name": "Алмазный рейтинг", "description": "Достичь рейтинга Эло 1750", "icon": "💎", "type": "rating",
                 "value": 1750},
    "elo_1800": {"name": "Мастер Эло", "description": "Достичь рейтинга Эло 1800", "icon": "💎", "type": "rating",
                 "value": 1800},
    "elo_1900": {"name": "Элитный рейтинг", "description": "Достичь рейтинга Эло 1900", "icon": "👑", "type": "rating",
                 "value": 1900},

    # ========== СУДЕЙСКИЕ (judge) ==========
    "first_judge": {"name": "Первое свидание с правосудием", "description": "Отсудить первую игру", "icon": "⚖️",
                    "type": "judged", "value": 1},
    "five_judged": {"name": "Стажёр", "description": "Отсудить 5 игр", "icon": "📋", "type": "judged", "value": 5},
    "ten_judged": {"name": "Судья", "description": "Отсудить 10 игр", "icon": "👨‍⚖️", "type": "judged", "value": 10},
    "twenty_judged": {"name": "Мировой судья", "description": "Отсудить 20 игр", "icon": "🏛️", "type": "judged",
                      "value": 20},
    "fifty_judged": {"name": "Верховный судья", "description": "Отсудить 50 игр", "icon": "⚖️👑", "type": "judged",
                     "value": 50},

    # ========== РОЛЕВЫЕ (roles) ==========
    "sheriff_win": {"name": "Защитник города", "description": "Выиграть в роли Шерифа", "icon": "🕵️", "type": "role",
                    "value": "Шериф"},
    "mafia_win": {"name": "Тень", "description": "Выиграть в роли Мафии", "icon": "🔪", "type": "role",
                  "value": "Мафия"},
    "don_win": {"name": "Крёстный отец", "description": "Выиграть в роли Дона", "icon": "👑", "type": "role",
                "value": "Дон"},

    # ========== ОСОБЫЕ (special) ==========
    "pu_once": {"name": "В центре внимания", "description": "Стать ПУ в первый раз", "icon": "🎯", "type": "special",
                "value": 1},
    "pu_three": {"name": "Частая цель", "description": "Стать ПУ 3 раза", "icon": "🎪", "type": "special", "value": 3},
    "pu_master": {"name": "ПУ-мастер", "description": "Стать ПУ 5 раз", "icon": "👑", "type": "special", "value": 5},
    "pu_ten": {"name": "Легендарная жертва", "description": "Стать ПУ 10 раз", "icon": "🦁", "type": "special",
               "value": 10},
}


async def check_and_award_achievements(bot_instance: Bot, user_id: int = None):
    async with database.get_db() as conn:
        if user_id:
            players = [(user_id,)]
        else:
            async with conn.execute("SELECT user_id FROM users WHERE games_played > 0") as cur:
                players = await cur.fetchall()

        all_new_achievements = []
        for (u_id,) in players:
            async with conn.execute("SELECT nickname, games_played, games_won, elo FROM users WHERE user_id = ?",
                                    (u_id,)) as cur:
                player_data = await cur.fetchone()
                if not player_data: continue
                nickname, games_played, games_won, elo = player_data

            async with conn.execute("SELECT achievement_id FROM user_achievements WHERE user_id = ?", (u_id,)) as cur:
                earned = {row[0] for row in await cur.fetchall()}

            async with conn.execute("""
                                    SELECT s.role, COUNT(*) as wins
                                    FROM game_slots_history s
                                             JOIN game_history g
                                                  ON g.game_date = s.game_date AND g.game_number = s.game_number
                                    WHERE s.user_id = ?
                                      AND s.base_points >= 1
                                    GROUP BY s.role
                                    """, (u_id,)) as cur:
                role_wins = {row[0]: row[1] for row in await cur.fetchall()}

            async with conn.execute("SELECT COUNT(*) FROM game_slots_history WHERE user_id = ? AND pu = 1",
                                    (u_id,)) as cur:
                pu_count = (await cur.fetchone())[0] or 0

            async with conn.execute("SELECT COUNT(*) FROM game_history WHERE judge_id = ?", (u_id,)) as cur:
                judged_games = (await cur.fetchone())[0] or 0

            for ach_id, ach in ACHIEVEMENTS.items():
                if ach_id in earned: continue
                earned_ach = False
                if ach["type"] == "games":
                    earned_ach = games_played >= ach["value"]
                elif ach["type"] == "wins":
                    earned_ach = games_won >= ach["value"]
                elif ach["type"] == "rating":
                    earned_ach = (elo or 0) >= ach["value"]
                elif ach["type"] == "judged":
                    earned_ach = judged_games >= ach["value"]
                elif ach["type"] == "role":
                    earned_ach = role_wins.get(ach["value"], 0) >= 1
                elif ach["type"] == "special":
                    if ach_id == "pu_once":
                        earned_ach = pu_count >= 1
                    elif ach_id == "pu_three":
                        earned_ach = pu_count >= 3
                    elif ach_id == "pu_master":
                        earned_ach = pu_count >= 5
                    elif ach_id == "pu_ten":
                        earned_ach = pu_count >= 10

                if earned_ach:
                    await conn.execute(
                        "INSERT INTO user_achievements (user_id, achievement_id, earned_at) VALUES (?, ?, datetime('now'))",
                        (u_id, ach_id))
                    all_new_achievements.append((u_id, nickname, ach_id, ach))
        await conn.commit()

        for u_id, nick, ach_id, ach in all_new_achievements:
            try:
                await bot_instance.send_message(
                    u_id,
                    f"🏆 **НОВАЯ АЧИВКА!**\n\n{ach['icon']} **{ach['name']}**\n_{ach['description']}_\n\nПоздравляем! 🎉",
                    parse_mode=ParseMode.MARKDOWN
                )
            except Exception as e:
                print(f"[ACHIEVEMENT] Failed to notify {nick}: {e}")
        return all_new_achievements




def setup_admin_handlers(bot_instance: Bot):
    global bot
    bot = bot_instance


def _is_admin(user_id: int) -> bool:
    return user_id in config.ADMIN_IDS


async def _is_judge(user_id: int) -> bool:
    if _is_admin(user_id): return True
    judges = await database.get_game_judges()
    return user_id in judges










@router.message(F.text == "📋 Игроки", F.chat.type == "private")
async def show_players_btn(message: types.Message):
    user_id = message.from_user.id
    is_admin, is_judge = _is_admin(user_id), await _is_judge(user_id)
    if not is_admin and not is_judge: return
    date_str = get_next_friday()
    text = await build_stats_text(date_str)
    if "всего 0" in text:
        await message.answer(f"На ближайший вечер {date_str} пока никто не записался.")
        return
    reply_kb = keyboards.admin_menu() if is_admin else keyboards.judge_menu()
    await message.answer(text, reply_markup=reply_kb)





















# Выбор месяца

# Выбор конкретного вечера

# Навигация "Назад"





# ========== БЭКАП ==========
# The Python bot's mafia_crm.db is legacy local state, not the canonical product
# database. Product data lives in /data/mafia_crm.sqlite and is backed up by the
# dedicated sqlite-backup worker. Never offer a bot-local restore that can be
# mistaken for restoring the club database.

_BACKUP_INFO = (
    "📁 <b>Бэкапы клубной базы</b>\n\n"
    "Каноническая база приложения: <code>/data/mafia_crm.sqlite</code>.\n"
    "Её резервные копии автоматически создаёт отдельный backup-worker в "
    "<code>/data/backups</code> и проверяет через SQLite integrity_check.\n\n"
    "Восстановление через Telegram отключено: оно требует явной проверки файла "
    "и отдельной процедуры на сервере, чтобы случайно не заменить актуальные данные."
)


@router.message(F.text == "📁 Бэкапы")
async def admin_backup_menu(message: Message):
    if message.from_user.id != config.BACKUP_ADMIN_ID:
        await message.answer("⛔ Доступ запрещён")
        return
    await message.answer(_BACKUP_INFO, parse_mode="HTML", reply_markup=keyboards.admin_menu())


@router.message(F.text == "📁 Создать бэкап")
async def admin_create_backup(message: Message):
    if message.from_user.id != config.BACKUP_ADMIN_ID:
        await message.answer("⛔ Доступ запрещён")
        return
    await message.answer(
        _BACKUP_INFO + "\n\nРучное создание legacy <code>mafia_crm.db</code> отключено.",
        parse_mode="HTML",
        reply_markup=keyboards.admin_menu(),
    )


@router.message(F.text == "🔄 Восстановить бэкап")
async def admin_restore_backup(message: Message):
    if message.from_user.id != config.BACKUP_ADMIN_ID:
        await message.answer("⛔ Доступ запрещён")
        return
    await message.answer(
        _BACKUP_INFO + "\n\nФайл сюда отправлять не нужно.",
        parse_mode="HTML",
        reply_markup=keyboards.admin_menu(),
    )


@router.message(F.document)
async def handle_backup_file(message: Message):
    """Fail closed: uploaded DB files must never replace any runtime DB from Telegram."""
    if message.from_user.id != config.BACKUP_ADMIN_ID:
        return
    await message.answer(
        "⛔ Восстановление базы из Telegram отключено. "
        "Файл не применён и никакие данные не изменены.",
        reply_markup=keyboards.admin_menu(),
    )


@router.message(F.text == "🔙 Назад в админ-меню")
async def back_to_admin_menu(message: Message):
    """Возврат в главное админ-меню"""
    await message.answer(
        "🔙 Возврат в админ-панель",
        reply_markup=keyboards.admin_menu()
    )