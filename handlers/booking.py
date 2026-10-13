from datetime import datetime, timedelta
from typing import List

from aiogram import Router

import database

router = Router()


# =========================================================
# BOOKING — ЗАПИСЬ НА ВЕЧЕР МАФИИ
# =========================================================


# =========================================================
# 0. FSM ДЛЯ ПОДТВЕРЖДЕНИЯ АНОНСА
# =========================================================



# =========================================================
# 1. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
# =========================================================

def get_next_friday() -> str:
    """
    Возвращает дату ближайшей пятницы в формате "ДД.ММ".
    """
    now = datetime.utcnow()
    weekday = now.weekday()

    if weekday <= 4:
        days_ahead = 4 - weekday
    else:
        days_ahead = 7 - (weekday - 4)

    return (now + timedelta(days=days_ahead)).strftime("%d.%m")


async def build_stats_text(date: str) -> str:
    """
    Строит текстовую сводку по записи на конкретную дату.
    """
    ontime = await database.get_players_by_status_for_date(date, "Вовремя")
    late = await database.get_players_by_status_for_date(date, "Позже")
    no = await database.get_players_by_status_for_date(date, "Не идёт")

    total = len(ontime) + len(late)

    def block(title: str, items: List[str]) -> str:
        if not items:
            return f"{title}: —"
        lines = [
            f"{i}. {name if name and name != 'Неизвестный' else 'Игрок без профиля'}"
            for i, name in enumerate(items, start=1)
        ]
        return f"{title}:\n" + "\n".join(lines)

    parts = [
        f"📊 Запись на {date} (всего {total}):",
        block("✅ Идут вовремя", ontime),
        block("⏳ Придут позже", late),
        block("❌ Не идут", no),
    ]
    return "\n\n".join(parts)








# =========================================================
# 2. ХЕНДЛЕРЫ ЗАПИСИ
# =========================================================







# =========================================================
# 3. ОБРАБОТКА ПОДТВЕРЖДЕНИЯ АНОНСА ОТ АДМИНА
# =========================================================





# =========================================================
# 4. ХЕНДЛЕРЫ ПРОСМОТРА
# =========================================================
