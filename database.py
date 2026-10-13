import json
import datetime
from typing import Optional, Tuple, List, Dict
from contextlib import asynccontextmanager
import aiosqlite
import os

DB_NAME = "mafia_crm.db"

# СОЗДАНИЕ БЭКАПОВ

async def delete_temp_file(file_path: str):
    try:
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
            print(f"🗑️ Временный файл удалён: {file_path}")
    except Exception as e:
        print(f"❌ Ошибка удаления файла: {e}")


# ========== УТИЛИТЫ ДЛЯ РАБОТЫ С БД ==========
@asynccontextmanager
async def get_db():
    """Контекстный менеджер для соединения с БД."""
    async with aiosqlite.connect(DB_NAME) as conn:
        conn.row_factory = aiosqlite.Row
        yield conn


def _ensure_iso_date(date_str: str) -> str:
    """Умный конвертер в ISO формат (YYYY-MM-DD)."""
    if not date_str: 
        return date_str
    if "-" in date_str and len(date_str) == 10: 
        return date_str
    try:
        parts = date_str.split(".")
        day = parts[0].zfill(2)
        month = parts[1].zfill(2)
        year = parts[2] if len(parts) == 3 else str(datetime.datetime.now().year)
        return f"{year}-{month}-{day}"
    except:
        return date_str


def format_date_to_user(date_str: str) -> str:
    """Превращает 2026-05-13 в 13.05.2026"""
    if not date_str or '-' not in date_str:
        return date_str
    try:
        parts = date_str.split('-')
        if len(parts) == 3:
            return f"{parts[2]}.{parts[1]}.{parts[0]}"
        return date_str
    except Exception:
        return date_str


async def _ensure_columns():
    """Гарантирует наличие всех нужных колонок в существующих таблицах."""
    async with get_db() as conn:
        alters = [
            ("users", "games_played", "INTEGER DEFAULT 0"),
            ("users", "games_won", "INTEGER DEFAULT 0"),
            ("users", "points", "INTEGER DEFAULT 0"),
            ("users", "kicks", "INTEGER DEFAULT 0"),
            ("users", "ppk_causes", "INTEGER DEFAULT 0"),
            ("game_history", "game_number", "INTEGER"),
            ("game_history", "global_game_number", "INTEGER"),
            ("game_slots_history", "will_protocol_points", "REAL DEFAULT 0"),
            ("game_slots_history", "will_opinion_points", "REAL DEFAULT 0"),
            ("game_slots_history", "kick", "INTEGER DEFAULT 0"),
            ("game_slots_history", "ppk", "INTEGER DEFAULT 0"),
            ("game_slots_history", "technical_fouls", "INTEGER DEFAULT 0"),
            ("game_slots_history", "dc_points", "REAL DEFAULT 0"),
            ("game_slots_history", "pu", "INTEGER DEFAULT 0"),
            ("game_slots_history", "will_protocol_raw", "TEXT DEFAULT ''"),
            ("game_slots_history", "will_opinion", "TEXT DEFAULT ''"),
            ("game_slots_history", "game_number", "INTEGER DEFAULT 0"),
            ("game_slots_history", "alive", "INTEGER DEFAULT 1"),
            ("game_slots_history", "status_reason", "TEXT DEFAULT 'Жив'"),
            ("game_slots_history", "updated_by_editor", "INTEGER DEFAULT 0"),
        ]
        for table, col, col_type in alters:
            for col_name in col if isinstance(col, list) else [col]:
                try:
                    await conn.execute(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type}")
                except Exception:
                    pass
        await conn.commit()


# ========== 1. ИНИЦИАЛИЗАЦИЯ ==========
async def init_db():
    """Инициализация всех таблиц."""
    async with get_db() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS game_slots_history (
                id                   INTEGER PRIMARY KEY AUTOINCREMENT,
                game_date            TEXT,
                game_number          INTEGER DEFAULT 0,
                user_id              INTEGER,
                slot_num             INTEGER,
                role                 TEXT,
                team                 TEXT,
                base_points          REAL    DEFAULT 0,
                bonus_points         REAL    DEFAULT 0,
                lh_points            REAL    DEFAULT 0,
                will_protocol_points REAL    DEFAULT 0,
                will_opinion_points  REAL    DEFAULT 0,
                dc_points            REAL    DEFAULT 0,
                kick                 INTEGER DEFAULT 0,
                ppk                  INTEGER DEFAULT 0,
                technical_fouls      INTEGER DEFAULT 0,
                pu                   INTEGER DEFAULT 0,
                will_protocol_raw    TEXT    DEFAULT '',
                will_opinion         TEXT    DEFAULT '',
                alive                INTEGER DEFAULT 1,
                status_reason        TEXT    DEFAULT 'Жив',
                updated_by_editor    INTEGER DEFAULT 0,
                fouls                INTEGER DEFAULT 0,
                elo_change           INTEGER DEFAULT 0,
                new_elo              INTEGER DEFAULT 1500
            )
        """)
        
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                user_id          INTEGER PRIMARY KEY,
                full_name        TEXT,
                username         TEXT,
                nickname         TEXT UNIQUE,
                debt             INTEGER DEFAULT 0,
                last_visit       TEXT,
                total_paid       INTEGER DEFAULT 0,
                kicks            INTEGER DEFAULT 0,
                ppk_causes       INTEGER DEFAULT 0,
                games_played     INTEGER DEFAULT 0,
                games_won        INTEGER DEFAULT 0,
                points           INTEGER DEFAULT 0,
                games_red        INTEGER DEFAULT 0,
                wins_red         INTEGER DEFAULT 0,
                games_black      INTEGER DEFAULT 0,
                wins_black       INTEGER DEFAULT 0,
                exp_level        TEXT,
                skill_level      TEXT,
                winrate_red      REAL DEFAULT 0,
                winrate_black    REAL DEFAULT 0,
                has_unpaid_session INTEGER DEFAULT 0,
                tokens           INTEGER DEFAULT 0,
                created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS evening_booking (
                user_id INTEGER PRIMARY KEY,
                status TEXT,
                date TEXT
            )
        """)
        
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS evening_history (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                date      TEXT,
                user_id   INTEGER,
                status    TEXT,
                full_name TEXT,
                nickname  TEXT,
                amount    INTEGER DEFAULT 0
            )
        """)
        
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS evening_stats_messages (
                date TEXT PRIMARY KEY,
                chat_id INTEGER,
                message_id INTEGER
            )
        """)
        
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS evening_status (
                date TEXT PRIMARY KEY,
                bills_sent INTEGER DEFAULT 0
            )
        """)
        
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        """)
        
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS game_history (
                id                 INTEGER PRIMARY KEY AUTOINCREMENT,
                game_date          TEXT,
                winner_label       TEXT,
                protocol_text      TEXT,
                game_number        INTEGER,
                global_game_number INTEGER,
                judge_id           INTEGER DEFAULT 0
            )
        """)
        
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS night_kills_order (
                game_date TEXT,
                game_number INTEGER,
                kill_order TEXT,
                PRIMARY KEY (game_date, game_number)
            )
        """)
        
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS user_achievements (
                user_id        INTEGER,
                achievement_id TEXT,
                earned_at      TEXT DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, achievement_id),
                FOREIGN KEY (user_id) REFERENCES users (user_id)
            )
        """)
        
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS bets_active (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id     INTEGER NOT NULL,
                game_number INTEGER NOT NULL,
                game_date   TEXT    NOT NULL,
                created_by  INTEGER NOT NULL,
                created_at  TEXT    DEFAULT CURRENT_TIMESTAMP,
                closed      BOOLEAN DEFAULT 0,
                resolved    BOOLEAN DEFAULT 0,
                winner_team TEXT,
                FOREIGN KEY (game_id) REFERENCES game_history (id)
            )
        """)
        
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS user_bets (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id          INTEGER NOT NULL,
                bet_id           INTEGER NOT NULL,
                amount           INTEGER NOT NULL,
                predicted_winner TEXT    NOT NULL,
                created_at       TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (user_id),
                FOREIGN KEY (bet_id) REFERENCES bets_active (id)
            )
        """)
        
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS transactions (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    INTEGER,
                amount     REAL,
                type       TEXT,
                comment    TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (user_id)
            )
        """)
        
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS game_dates (
                date TEXT PRIMARY KEY,
                announcement_requested INTEGER DEFAULT 0
            )
        """)
        
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS elo_ratings (
                user_id INTEGER PRIMARY KEY,
                elo INTEGER DEFAULT 1500,
                games_played INTEGER DEFAULT 0,
                games_won INTEGER DEFAULT 0,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (user_id)
            )
        """)
        
        await conn.commit()

    await _ensure_columns()
    await add_fouls_column()
    await create_elo_table()
    print("✅ База данных инициализирована")


# ========== 2. SETTINGS ==========
async def get_setting(key: str) -> Optional[str]:
    async with get_db() as conn:
        async with conn.execute("SELECT value FROM settings WHERE key = ?", (key,)) as cur:
            row = await cur.fetchone()
            return row[0] if row else None


async def set_setting(key: str, value: Optional[str]):
    async with get_db() as conn:
        if value is None:
            await conn.execute("DELETE FROM settings WHERE key = ?", (key,))
        else:
            await conn.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, value))
        await conn.commit()


def _make_setting_funcs(key_prefix: str):
    async def getter() -> Optional[int]:
        val = await get_setting(key_prefix)
        return int(val) if val and val.isdigit() else None

    async def setter(num: int):
        await set_setting(key_prefix, str(num))

    return getter, setter


get_current_game_date = lambda: get_setting("current_game_date")
set_current_game_date = lambda d: set_setting("current_game_date", d)
get_current_game_number, set_current_game_number = _make_setting_funcs("current_game_number")
get_current_global_game_number, set_current_global_game_number = _make_setting_funcs("current_game_global_number")










async def get_game_judges() -> List[int]:
    raw = await get_setting("game_judges")
    if not raw: return []
    try:
        data = json.loads(raw)
        return [int(x) for x in data if isinstance(x, (int, str))] if isinstance(data, list) else []
    except Exception:
        return []




async def is_game_judge(user_id: int) -> bool:
    judges = await get_game_judges()
    return user_id in judges












# ========== 3. ПОЛЬЗОВАТЕЛИ ==========


async def get_user_profile(user_id: int) -> Optional[Tuple]:
    async with get_db() as conn:
        async with conn.execute("SELECT full_name, nickname, debt, last_visit FROM users WHERE user_id = ?",
                                (user_id,)) as cur:
            return await cur.fetchone()


















async def get_user_by_id(user_id: int) -> Optional[Tuple[int, str, str, str]]:
    async with get_db() as conn:
        async with conn.execute("SELECT user_id, full_name, username, nickname FROM users WHERE user_id = ?",
                                (user_id,)) as cur:
            return await cur.fetchone()


async def get_user_by_nickname(nickname: str) -> Optional[Tuple[int, str, str, str]]:
    async with get_db() as conn:
        async with conn.execute("SELECT user_id, full_name, username, nickname FROM users WHERE nickname = ?",
                                (nickname,)) as cur:
            row = await cur.fetchone()
            if row: return row
        async with conn.execute("SELECT user_id, full_name, username, nickname FROM users WHERE full_name = ?",
                                (nickname,)) as cur:
            row = await cur.fetchone()
            if row: return row
        async with conn.execute("SELECT user_id, full_name, username, nickname FROM users WHERE nickname LIKE ?",
                                (f"%{nickname}%",)) as cur:
            row = await cur.fetchone()
            if row: return row
        return None




# ========== 4. ЗАПИСЬ НА ВЕЧЕР ==========


















async def get_players_by_status_for_date(date_str: str, status: str) -> list:
    async with get_db() as conn:
        async with conn.execute(
                "SELECT COALESCE(u.nickname, u.full_name, 'Без имени') AS name FROM evening_booking e LEFT JOIN users u ON e.user_id = u.user_id WHERE e.date = ? AND e.status = ? ORDER BY name",
                (date_str, status)) as cur:
            return [row[0] for row in await cur.fetchall()]








# ========== 5. ФИНАНСЫ ==========
















async def has_unpaid_session(user_id: int) -> bool:
    async with get_db() as conn:
        async with conn.execute("SELECT has_unpaid_session FROM users WHERE user_id = ?", (user_id,)) as cur:
            row = await cur.fetchone()
            return bool(row and row[0])




# ========== 6. ИСТОРИЯ ВЕЧЕРОВ ==========






















# ========== 7. РЕЗУЛЬТАТЫ ИГР ==========


async def get_user_game_counters(user_id: int) -> Optional[Dict[str, int]]:
    async with get_db() as conn:
        async with conn.execute("SELECT 1 FROM users WHERE user_id = ?", (user_id,)) as cur:
            if not await cur.fetchone(): 
                return None
        async with conn.execute(
                "SELECT COUNT(*) AS played, SUM(CASE WHEN base_points = 1 THEN 1 ELSE 0 END) AS won, SUM(base_points) AS points FROM game_slots_history WHERE user_id = ?",
                (user_id,)) as cur:
            row = await cur.fetchone()
            return {"games_played": row[0] or 0, "games_won": row[1] or 0, "points": row[2] or 0}


async def get_user_roles_stats(user_id: int) -> List[Dict]:
    async with get_db() as conn:
        async with conn.execute("""
            SELECT role,
                   COUNT(*)                                                                     AS games,
                   SUM(CASE WHEN base_points = 1 THEN 1 ELSE 0 END)                             AS wins,
                   SUM(base_points + bonus_points + lh_points + will_protocol_points +
                       will_opinion_points + dc_points)                                         AS total_points,
                   SUM(bonus_points)                                                            AS total_bonus,
                   SUM(lh_points)                                                               AS total_lh,
                   SUM(dc_points)                                                               AS total_negative,
                   AVG(will_protocol_points)                                                    AS protocol_avg,
                   SUM(CASE WHEN will_protocol_points > 0 THEN 1 ELSE 0 END)                    AS protocol_pos_count,
                   SUM(CASE WHEN will_protocol_points > 0 THEN will_protocol_points ELSE 0 END) AS protocol_pos_sum,
                   SUM(CASE WHEN will_protocol_points < 0 THEN 1 ELSE 0 END)                    AS protocol_neg_count,
                   SUM(CASE WHEN will_protocol_points < 0 THEN will_protocol_points ELSE 0 END) AS protocol_neg_sum,
                   AVG(will_opinion_points)                                                     AS opinion_avg,
                   SUM(CASE WHEN will_opinion_points > 0 THEN 1 ELSE 0 END)                     AS opinion_pos_count,
                   SUM(CASE WHEN will_opinion_points > 0 THEN will_opinion_points ELSE 0 END)   AS opinion_pos_sum,
                   SUM(CASE WHEN will_opinion_points < 0 THEN 1 ELSE 0 END)                     AS opinion_neg_count,
                   SUM(CASE WHEN will_opinion_points < 0 THEN will_opinion_points ELSE 0 END)   AS opinion_neg_sum,
                   SUM(kick)                                                                    AS total_kicks,
                   SUM(ppk)                                                                     AS total_ppk
            FROM game_slots_history
            WHERE user_id = ?
            GROUP BY role
        """, (user_id,)) as cur:
            rows = await cur.fetchall()

    result = []
    for row in rows:
        role, games, wins, total_points, total_bonus, total_lh, total_negative, protocol_avg, protocol_pos_count, protocol_pos_sum, protocol_neg_count, protocol_neg_sum, opinion_avg, opinion_pos_count, opinion_pos_sum, opinion_neg_count, opinion_neg_sum, total_kicks, total_ppk = row
        games = games or 0
        if games:
            winrate = round(wins / games * 100, 1) if games else 0
            avg_points = round((total_points or 0) / games, 2)
        else:
            winrate = avg_points = 0.0

        result.append({
            "role": role or "Не задана", "games": games, "wins": wins or 0, "winrate": winrate,
            "avg_points": avg_points,
            "total_points": total_points or 0.0, "total_bonus": total_bonus or 0.0, "total_lh": total_lh or 0.0,
            "total_negative": total_negative or 0.0, "protocol_avg": round(protocol_avg or 0, 2),
            "protocol_pos_count": protocol_pos_count or 0,
            "protocol_pos_sum": round(protocol_pos_sum or 0, 2), "protocol_neg_count": protocol_neg_count or 0,
            "protocol_neg_sum": round(protocol_neg_sum or 0, 2),
            "opinion_avg": round(opinion_avg or 0, 2), "opinion_pos_count": opinion_pos_count or 0,
            "opinion_pos_sum": round(opinion_pos_sum or 0, 2),
            "opinion_neg_count": opinion_neg_count or 0, "opinion_neg_sum": round(opinion_neg_sum or 0, 2),
            "kicks": total_kicks or 0, "ppk_causes": total_ppk or 0,
        })
    return result


# ========== 8. ИСТОРИЯ ИГР ==========


async def get_user_extra_stats(user_id: int) -> Dict[str, float]:
    async with get_db() as conn:
        async with conn.execute(
                "SELECT AVG(lh_points) AS avg_lh, SUM(kick) AS removed_count, SUM(technical_fouls) AS techfouls_total, SUM(ppk) AS ppk_guilty_count, SUM(pu) AS pu_count, SUM(fouls) AS fouls_total FROM game_slots_history WHERE user_id = ?",
                (user_id,)) as cur:
            row = await cur.fetchone()
    if not row: 
        return {"avg_lh": 0.0, "removed_count": 0, "techfouls_total": 0, "ppk_guilty_count": 0, "pu_count": 0, "fouls_total": 0}
    avg_lh, removed_count, techfouls_total, ppk_guilty_count, pu_count, fouls_total = row
    return {"avg_lh": float(avg_lh or 0.0), "removed_count": int(removed_count or 0),
            "techfouls_total": int(techfouls_total or 0), "ppk_guilty_count": int(ppk_guilty_count or 0),
            "pu_count": int(pu_count or 0), "fouls_total": int(fouls_total or 0)}












async def get_all_game_dates() -> List[Tuple[str, int]]:
    async with get_db() as conn:
        async with conn.execute(
                "SELECT game_date, COUNT(*) as games_count FROM game_history GROUP BY game_date ORDER BY game_date DESC") as cur:
            return await cur.fetchall()


# ========== 10. ДЕТАЛЬНАЯ РАБОТА С ИГРАМИ ==========
async def get_game_by_id(game_id: int) -> Optional[Dict]:
    async with get_db() as conn:
        async with conn.execute(
                "SELECT id, game_date, winner_label, protocol_text, game_number, global_game_number, judge_id FROM game_history WHERE id = ?",
                (game_id,)) as cur:
            row = await cur.fetchone()
            return dict(row) if row else None


async def get_game_slots_by_date(game_date: str, game_number: int = None) -> Optional[Dict[int, dict]]:
    search_date = _ensure_iso_date(game_date)
    query = "SELECT * FROM game_slots_history WHERE game_date = ?"
    params = [search_date]
    if game_number is not None:
        query += " AND game_number = ?"
        params.append(game_number)
    query += " ORDER BY slot_num ASC"

    async with get_db() as conn:
        async with conn.execute(query, params) as cur:
            rows = await cur.fetchall()
            if not rows: 
                return None

            slots = {}
            for r in rows:
                u_id = r['user_id']
                nickname = "Игрок"
                if u_id:
                    async with conn.execute("SELECT nickname, full_name FROM users WHERE user_id = ?",
                                            (u_id,)) as u_cur:
                        u_row = await u_cur.fetchone()
                        if u_row:
                            nickname = u_row['nickname'] or u_row['full_name']

                slot_data = dict(r)
                slot_data['nickname'] = nickname
                slots[r['slot_num']] = slot_data
            return slots








# ========== 11. АНОНСЫ СТОЛА И УБИЙСТВА ==========






async def get_night_kills_order(game_date: str, game_number: int) -> List[int]:
    search_date = _ensure_iso_date(game_date)
    async with get_db() as conn:
        async with conn.execute("SELECT kill_order FROM night_kills_order WHERE game_date = ? AND game_number = ?",
                                (search_date, game_number)) as cur:
            row = await cur.fetchone()
            if row and row[0]: 
                return json.loads(row[0])
    return []


# ========== 12. РЕЙТИНГ, ФОЛЫ И ЭЛО ==========


async def add_fouls_column():
    async with get_db() as conn:
        try:
            await conn.execute("ALTER TABLE game_slots_history ADD COLUMN fouls INTEGER DEFAULT 0")
            await conn.commit()
        except Exception:
            pass




async def create_elo_table():
    async with get_db() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS elo_ratings (
                user_id INTEGER PRIMARY KEY,
                elo INTEGER DEFAULT 1500,
                games_played INTEGER DEFAULT 0,
                games_won INTEGER DEFAULT 0,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (user_id)
            )
        """)
        await conn.commit()


async def get_elo(user_id: int) -> int:
    async with get_db() as conn:
        async with conn.execute("SELECT elo FROM elo_ratings WHERE user_id = ?", (user_id,)) as cur:
            row = await cur.fetchone()
            return row[0] if row else 1500












# ========== 13. АЧИВКИ ==========






# ========== 14. ЖЕТОНЫ ==========
async def get_user_tokens(user_id: int) -> int:
    async with get_db() as conn:
        async with conn.execute("SELECT tokens FROM users WHERE user_id = ?", (user_id,)) as cur:
            row = await cur.fetchone()
            return row[0] if row else 0


async def add_tokens(user_id: int, amount: int, comment: str = "Игровые жетоны"):
    async with get_db() as conn:
        await conn.execute("UPDATE users SET tokens = tokens + ? WHERE user_id = ?", (amount, user_id))
        await conn.execute("INSERT INTO transactions (user_id, amount, type, comment) VALUES (?, ?, ?, ?)",
                           (user_id, amount, 'tokens', comment))
        await conn.commit()




# ========== 15. СТАВКИ ==========


async def get_active_bet(game_id: int) -> Optional[Dict]:
    async with get_db() as conn:
        async with conn.execute(
                "SELECT id, game_id, game_number, game_date, created_by, created_at, closed, resolved, winner_team FROM bets_active WHERE game_id = ? AND closed = 0 AND resolved = 0",
                (game_id,)) as cur:
            row = await cur.fetchone()
            if row: 
                return {"id": row[0], "game_id": row[1], "game_number": row[2], "game_date": row[3],
                        "created_by": row[4], "created_at": row[5], "closed": row[6], "resolved": row[7],
                        "winner_team": row[8]}
    return None






async def place_bet(user_id: int, bet_id: int, amount: int, predicted_winner: str) -> bool:
    try:
        async with get_db() as conn:
            await conn.execute("INSERT INTO user_bets (user_id, bet_id, amount, predicted_winner) VALUES (?, ?, ?, ?)",
                               (user_id, bet_id, amount, predicted_winner))
            await conn.commit()
            return True
    except Exception:
        return False










# ========== 16. СУДЬИ И СИНХРОНИЗАЦИЯ ==========
async def get_judged_games_count(user_id: int) -> int:
    async with get_db() as conn:
        async with conn.execute("SELECT COUNT(*) FROM game_history WHERE judge_id = ?", (user_id,)) as cur:
            row = await cur.fetchone()
            return row[0] if row else 0



