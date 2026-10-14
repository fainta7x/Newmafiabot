from aiogram.utils.keyboard import ReplyKeyboardBuilder, InlineKeyboardBuilder
from aiogram.types import InlineKeyboardMarkup

# ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========


# ========== ГЛАВНЫЕ МЕНЮ ПОЛЬЗОВАТЕЛЯ / СУДЬИ / АДМИНА ==========
def main_menu():
    """The one short keyboard (owner, 2026-10-13): app + menu card. The old ten-button menus are retired;
    their text buttons still work for phones that keep the old keyboard."""
    import bot_menu
    return bot_menu.main_menu_for_user()


def main_menu_judge():
    return main_menu()


def main_menu_admin():
    return main_menu()


# ========== АДМИН-МЕНЮ (REPLY, ВНУТРЕННЯЯ ПАНЕЛЬ) ==========
def admin_menu():
    """
    ВНУТРЕННЯЯ панель администратора:
    используется после входа через '🛠 Админ-панель' или /admin.
    """
    builder = ReplyKeyboardBuilder()
    builder.button(text="🎲 Новая игра")
    builder.button(text="♻️ Продолжить игру")
    builder.button(text="📋 Игроки")
    builder.button(text="👥 Все пользователи")
    builder.button(text="💰 Должники")
    builder.button(text="📣 Сделать анонс")
    builder.button(text="💸 Разослать счета")
    builder.button(text="📚 История вечеров")
    builder.button(text="❌ Отменить вечер")
    builder.button(text="⚖ Судьи")
    builder.button(text="🏠 В главное меню")
    builder.button(text="📁 Бэкапы")
    builder.adjust(2, 3, 2, 2, 3)
    return builder.as_markup(resize_keyboard=True, is_persistent=True)




def judge_menu():
    """
    ВНУТРЕННЯЯ панель судьи (после нажатия '⚖ Панель судьи'):
    управление играми и возврат в главное меню.
    """
    builder = ReplyKeyboardBuilder()
    builder.button(text="🎲 Новая игра")
    builder.button(text="♻️ Продолжить игру")
    builder.button(text="📋 Игроки")
    builder.button(text="🏠 В главное меню")
    builder.adjust(2, 2)
    return builder.as_markup(resize_keyboard=True, is_persistent=True)


# ========== ЗАПИСЬ НА ИГРУ ==========


# ========== ФИНАНСЫ ==========








# ========== INLINE КЛАВИАТУРЫ ==========








# ========== ДОПОЛНИТЕЛЬНЫЕ УДОБНЫЕ КЛАВИАТУРЫ ==========






# ========== НОВЫЕ КЛАВИАТУРЫ ДЛЯ РЕЖИМА РЕДАКТИРОВАНИЯ ==========


def get_edit_menu_keyboard(slot_num: int, slot_data: dict) -> InlineKeyboardMarkup:
    role = slot_data.get("role", "Не задана")
    team = slot_data.get("team", "—")
    alive = slot_data.get("alive", True)
    status_reason = slot_data.get("status_reason", "Жив")
    pu_mark = slot_data.get("pu_mark", False)
    lh = slot_data.get("night_suspects", [])
    protocol = slot_data.get("will_protocol_raw", "")
    opinion = slot_data.get("will_opinion", "")
    kicked = slot_data.get("kicked", False)

    status_text = "✅ Жив" if alive else f"💀 {status_reason}"
    if kicked:
        status_text = "🚫 Удалён"

    role_display = role if len(role) <= 10 else role[:8] + ".."
    team_display = team if team and len(team) <= 8 else team[:6] + ".." if team else "—"

    builder = InlineKeyboardBuilder()

    builder.button(text=f"🎭 {role_display}", callback_data="edit_role")
    builder.button(text=f"🏳️ {team_display}", callback_data="edit_team")
    builder.button(text=f"📊 {status_text}", callback_data="edit_status")
    pu_text = "👑 ПУ: ✅" if pu_mark else "👑 ПУ: ❌"
    builder.button(text=pu_text, callback_data="edit_pu")
    lh_text = f"📝 ЛХ: {len(lh)}" if lh else "📝 ЛХ: нет"
    protocol_text = "📋 ПР: есть" if protocol else "📋 ПР: нет"
    builder.button(text=lh_text, callback_data="edit_lh")
    builder.button(text=protocol_text, callback_data="edit_protocol")
    opinion_text = "💬 МН: есть" if opinion else "💬 МН: нет"
    builder.button(text=opinion_text, callback_data="edit_opinion")
    builder.button(text="🔄 Очистить", callback_data="edit_clear_all")
    builder.button(text="◀️ Назад", callback_data="edit_back_to_menu")
    builder.button(text="❌ Закрыть", callback_data="edit_close")

    builder.adjust(2, 2, 2, 2, 2)
    return builder.as_markup()














# ========== НОВЫЕ КЛАВИАТУРЫ ДЛЯ СОЗДАНИЯ ИГРЫ ==========




# ========== КЛАВИАТУРЫ ДЛЯ УПРАВЛЕНИЯ ФОЛАМИ ==========




# ========== КЛАВИАТУРЫ ДЛЯ ВЫСТАВЛЕНИЯ (НОМИНАЦИИ) ==========


# ========== КЛАВИАТУРЫ ДЛЯ ГОЛОСОВАНИЯ ==========


# ========== КЛАВИАТУРЫ ДЛЯ РЕДАКТОРА БАЛЛОВ ПОСЛЕ ИГРЫ ==========






edit_actions_kb = get_edit_menu_keyboard


# ========== КЛАВИАТУРЫ ДЛЯ УБИЙСТВА ==========








# ========== НОВЫЕ КЛАВИАТУРЫ ДЛЯ ППК ==========






# ========== НОВЫЕ КЛАВИАТУРЫ ДЛЯ УПРАВЛЕНИЯ СУДЬЯМИ ==========








# ========== КЛАВИАТУРА ДЛЯ ПОДТВЕРЖДЕНИЯ АНОНСА ==========


# ========== КЛАВИАТУРЫ ДЛЯ ПРОСМОТРА ПРОФИЛЕЙ ==========


def player_profile_kb(user_id: int, nickname: str) -> InlineKeyboardMarkup:
    """Клавиатура для просмотра профиля найденного игрока."""
    builder = InlineKeyboardBuilder()
    builder.button(
        text=f"👤 Посмотреть профиль {nickname}",
        callback_data=f"view_profile:{user_id}"
    )
    builder.button(text="❌ Отмена", callback_data="close_search")
    builder.adjust(1)
    return builder.as_markup()




def player_actions_kb(viewed_user_id: int) -> InlineKeyboardMarkup:
    """Клавиатура действий после просмотра профиля."""
    builder = InlineKeyboardBuilder()
    builder.button(text="🔍 Найти другого", callback_data="search_player")
    builder.button(text="❌ Закрыть", callback_data="close_profile")
    builder.adjust(1)
    return builder.as_markup()


# ========== КЛАВИАТУРА ДЛЯ СТАТИСТИКИ ==========


# Клава выбора года

# Клава выбора месяца (с суммой)

# Клава конкретных вечеров (твой запрос)