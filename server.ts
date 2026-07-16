import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { Player, Booking, Game, GameSlot, ShopItem, ShopPurchase } from "./src/types.js";

const DB_FILE = path.join(process.cwd(), "mafia_db.json");

// Define Achievements schema identical to python code
const ACHIEVEMENTS = {
  // Games played
  "first_game": { name: "Первая игра", description: "Сыграть первую игру", icon: "🎭", type: "games", value: 1 },
  "ten_games": { name: "Новичок", description: "Сыграть 10 игр", icon: "🌟", type: "games", value: 10 },
  "twenty_games": { name: "Любитель", description: "Сыграть 20 игр", icon: "🎲", type: "games", value: 20 },
  "thirty_games": { name: "Завсегдатай", description: "Сыграть 30 игр", icon: "🎯", type: "games", value: 30 },
  "fifty_games": { name: "Опытный игрок", description: "Сыграть 50 игр", icon: "⚡", type: "games", value: 50 },
  "seventy_games": { name: "Профи", description: "Сыграть 70 игр", icon: "🎓", type: "games", value: 70 },
  "hundred_games": { name: "Ветеран", description: "Сыграть 100 игр", icon: "🔥", type: "games", value: 100 },
  "one_fifty_games": { name: "Мастер", description: "Сыграть 150 игр", icon: "🏆", type: "games", value: 150 },
  "two_hundred_games": { name: "Легенда", description: "Сыграть 200 игр", icon: "👑", type: "games", value: 200 },

  // Wins
  "first_win": { name: "Первая победа", description: "Одержать первую победу", icon: "🏆", type: "wins", value: 1 },
  "five_wins": { name: "Первые успехи", description: "Одержать 5 побед", icon: "🌱", type: "wins", value: 5 },
  "ten_wins": { name: "Серийный победитель", description: "Одержать 10 побед", icon: "🎯", type: "wins", value: 10 },
  "twenty_wins": { name: "Закалка", description: "Одержать 20 побед", icon: "⚔️", type: "wins", value: 20 },
  "thirty_wins": { name: "Победный дух", description: "Одержать 30 побед", icon: "🎖️", type: "wins", value: 30 },
  "forty_wins": { name: "Покоритель", description: "Одержать 40 побед", icon: "⭐", type: "wins", value: 40 },
  "fifty_wins": { name: "Мастер побед", description: "Одержать 50 побед", icon: "🏅", type: "wins", value: 50 },
  "seventy_wins": { name: "Герой", description: "Одержать 70 побед", icon: "🦸", type: "wins", value: 70 },
  "hundred_wins": { name: "Легенда побед", description: "Одержать 100 побед", icon: "🏅", type: "wins", value: 100 },

  // ELO Rating
  "elo_1400": { name: "Начало пути", description: "Достичь рейтинга Эло 1400", icon: "🌱", type: "rating", value: 1400 },
  "elo_1500": { name: "Старт", description: "Достичь рейтинга Эло 1500", icon: "🌱", type: "rating", value: 1500 },
  "elo_1550": { name: "Бронзовый рейтинг", description: "Достичь рейтинга Эло 1550", icon: "🥉", type: "rating", value: 1550 },
  "elo_1600": { name: "Серебряный рейтинг", description: "Достичь рейтинга Эло 1600", icon: "⭐", type: "rating", value: 1600 },
  "elo_1650": { name: "Золотой рейтинг", description: "Достичь рейтинга Эло 1650", icon: "⭐", type: "rating", value: 1650 },
  "elo_1700": { name: "Платиновый рейтинг", description: "Достичь рейтинга Эло 1700", icon: "🏅", type: "rating", value: 1700 },
  "elo_1750": { name: "Алмазный рейтинг", description: "Достичь рейтинга Эло 1750", icon: "💎", type: "rating", value: 1750 },
  "elo_1800": { name: "Мастер Эло", description: "Достичь рейтинга Эло 1800", icon: "💎", type: "rating", value: 1800 },
  "elo_1900": { name: "Элитный рейтинг", description: "Достичь рейтинга Эло 1900", icon: "👑", type: "rating", value: 1900 },

  // Role Wins
  "sheriff_win": { name: "Защитник города", description: "Выиграть в роли Шерифа", icon: "🕵️", type: "role", value: "Шериф" },
  "mafia_win": { name: "Тень", description: "Выиграть в роли Мафии", icon: "🔪", type: "role", value: "Мафия" },
  "don_win": { name: "Крёстный отец", description: "Выиграть в роли Дона", icon: "👑", type: "role", value: "Дон" },

  // Special / PU (Best Move / LCh)
  "pu_once": { name: "В центре внимания", description: "Стать ПУ (первым убитым) в первый раз", icon: "🎯", type: "special", value: 1 },
  "pu_three": { name: "Частая цель", description: "Стать ПУ 3 раза", icon: "🎪", type: "special", value: 3 },
  "pu_master": { name: "ПУ-мастер", description: "Стать ПУ 5 раз", icon: "👑", type: "special", value: 5 },
  "pu_ten": { name: "Легендарная жертва", description: "Стать ПУ 10 раз", icon: "🦁", type: "special", value: 10 }
};

interface DB {
  players: Player[];
  bookings: Booking[];
  games: Game[];
  shop_purchases: ShopPurchase[];
}

const INITIAL_PLAYERS_SEED = [
  { nickname: "Алоэ", full_name: "Александр Козлов", username: "aloe_maf", games_played: 45, games_won: 23, elo: 1580, debt: -200, total_paid: 1200, tokens: 4500, achievements: ["first_game", "ten_games", "twenty_games", "thirty_games", "first_win", "five_wins", "ten_wins", "twenty_wins", "elo_1500", "elo_1550", "sheriff_win", "mafia_win", "pu_once"] },
  { nickname: "Аннушка", full_name: "Анна Смирнова", username: "ann_mafia", games_played: 62, games_won: 34, elo: 1640, debt: 0, total_paid: 2400, tokens: 8200, achievements: ["first_game", "ten_games", "twenty_games", "thirty_games", "fifty_games", "first_win", "five_wins", "ten_wins", "twenty_wins", "thirty_wins", "elo_1500", "elo_1550", "elo_1600", "sheriff_win", "don_win", "pu_once", "pu_three"] },
  { nickname: "Богданчик", full_name: "Богдан Иванов", username: "bogdan_play", games_played: 28, games_won: 12, elo: 1470, debt: -400, total_paid: 800, tokens: 1200, achievements: ["first_game", "ten_games", "twenty_games", "first_win", "five_wins", "ten_wins", "pu_once"] },
  { nickname: "Денди", full_name: "Дмитрий Петров", username: "dandy_maf", games_played: 54, games_won: 28, elo: 1565, debt: 0, total_paid: 2200, tokens: 5300, achievements: ["first_game", "ten_games", "twenty_games", "thirty_games", "fifty_games", "first_win", "five_wins", "ten_wins", "twenty_wins", "elo_1500", "elo_1550", "sheriff_win", "mafia_win"] },
  { nickname: "Джава", full_name: "Евгений Сидоров", username: "java_dev", games_played: 35, games_won: 18, elo: 1515, debt: -100, total_paid: 1400, tokens: 3400, achievements: ["first_game", "ten_games", "twenty_games", "thirty_games", "first_win", "five_wins", "ten_wins", "elo_1500", "mafia_win", "don_win"] },
  { nickname: "Джокер", full_name: "Артур Пирожков", username: "joker_wild", games_played: 71, games_won: 41, elo: 1720, debt: -300, total_paid: 2800, tokens: 11000, achievements: ["first_game", "ten_games", "twenty_games", "thirty_games", "fifty_games", "seventy_games", "first_win", "five_wins", "ten_wins", "twenty_wins", "thirty_wins", "forty_wins", "elo_1500", "elo_1550", "elo_1600", "elo_1650", "elo_1700", "sheriff_win", "mafia_win", "don_win", "pu_once", "pu_three", "pu_master"] },
  { nickname: "Добряк", full_name: "Павел Морозов", username: "dobryak_pasha", games_played: 83, games_won: 46, elo: 1690, debt: 0, total_paid: 3600, tokens: 9400, achievements: ["first_game", "ten_games", "twenty_games", "thirty_games", "fifty_games", "seventy_games", "first_win", "five_wins", "ten_wins", "twenty_wins", "thirty_wins", "forty_wins", "elo_1500", "elo_1550", "elo_1600", "elo_1650", "sheriff_win", "mafia_win", "don_win", "pu_once", "pu_three"] },
  { nickname: "Донор", full_name: "Кирилл Васильев", username: "donor_blood", games_played: 15, games_won: 6, elo: 1445, debt: 0, total_paid: 600, tokens: 1600, achievements: ["first_game", "ten_games", "first_win", "five_wins", "sheriff_win", "pu_once"] },
  { nickname: "Матроскина", full_name: "Мария Кот", username: "matros_cat", games_played: 49, games_won: 25, elo: 1540, debt: -200, total_paid: 1800, tokens: 4100, achievements: ["first_game", "ten_games", "twenty_games", "thirty_games", "first_win", "five_wins", "ten_wins", "twenty_wins", "elo_1500", "mafia_win", "don_win", "pu_once"] },
  { nickname: "Перец", full_name: "Игорь Острый", username: "perets_chili", games_played: 39, games_won: 20, elo: 1525, debt: 0, total_paid: 1600, tokens: 3100, achievements: ["first_game", "ten_games", "twenty_games", "thirty_games", "first_win", "five_wins", "ten_wins", "twenty_wins", "elo_1500", "sheriff_win", "mafia_win", "pu_once"] },
  { nickname: "Серый", full_name: "Сергей Серов", username: "seryj_wolf", games_played: 92, games_won: 51, elo: 1715, debt: -100, total_paid: 3800, tokens: 12500, achievements: ["first_game", "ten_games", "twenty_games", "thirty_games", "fifty_games", "seventy_games", "first_win", "five_wins", "ten_wins", "twenty_wins", "thirty_wins", "forty_wins", "fifty_wins", "elo_1500", "elo_1550", "elo_1600", "elo_1650", "elo_1700", "sheriff_win", "mafia_win", "don_win", "pu_once", "pu_three", "pu_master"] },
  { nickname: "Стаут", full_name: "Виталий Горький", username: "stout_beer", games_played: 59, games_won: 31, elo: 1590, debt: -400, total_paid: 2000, tokens: 6800, achievements: ["first_game", "ten_games", "twenty_games", "thirty_games", "fifty_games", "first_win", "five_wins", "ten_wins", "twenty_wins", "thirty_wins", "elo_1500", "elo_1550", "sheriff_win", "don_win", "pu_once", "pu_three"] },
  { nickname: "Чагин", full_name: "Константин Чагин", username: "chagin_kostya", games_played: 31, games_won: 15, elo: 1495, debt: 0, total_paid: 1200, tokens: 2600, achievements: ["first_game", "ten_games", "twenty_games", "thirty_games", "first_win", "five_wins", "ten_wins", "elo_1500", "mafia_win", "pu_once"] },
  { nickname: "Jin", full_name: "Алексей Джин", username: "jin_tonic", games_played: 22, games_won: 10, elo: 1480, debt: 0, total_paid: 800, tokens: 1900, achievements: ["first_game", "ten_games", "twenty_games", "first_win", "five_wins", "ten_wins", "sheriff_win"] },
  { nickname: "Гриня", full_name: "Григорий Лепс", username: "grinya_club", games_played: 18, games_won: 8, elo: 1460, debt: -100, total_paid: 600, tokens: 1400, achievements: ["first_game", "ten_games", "first_win", "five_wins", "mafia_win", "pu_once"] },
  { nickname: "Истина", full_name: "Екатерина Правдина", username: "veritas_true", games_played: 41, games_won: 22, elo: 1555, debt: 0, total_paid: 1600, tokens: 4900, achievements: ["first_game", "ten_games", "twenty_games", "thirty_games", "first_win", "five_wins", "ten_wins", "twenty_wins", "elo_1500", "elo_1550", "sheriff_win", "don_win", "pu_once", "pu_three"] }
];

// Helper to get next Friday formatted
function getNextFridayDateStr(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = (day <= 5 ? 5 - day : 12 - day); // days until next Friday
  d.setDate(d.getDate() + diff);
  return d.toLocaleDateString("ru-RU");
}

function loadDB(): DB {
  if (!fs.existsSync(DB_FILE)) {
    const nextFriday = getNextFridayDateStr();
    const players: Player[] = INITIAL_PLAYERS_SEED.map((p, i) => ({
      id: 1000 + i,
      user_id: 2000 + i,
      nickname: p.nickname,
      full_name: p.full_name,
      username: p.username,
      games_played: p.games_played,
      games_won: p.games_won,
      elo: p.elo,
      debt: p.debt,
      total_paid: p.total_paid,
      tokens: p.tokens,
      achievements: p.achievements,
      last_visit: "26.06.2026 21:00"
    }));

    const bookings: Booking[] = [
      { user_id: 2000, nickname: "Алоэ", status: "Вовремя", date: nextFriday },
      { user_id: 2001, nickname: "Аннушка", status: "Вовремя", date: nextFriday },
      { user_id: 2002, nickname: "Богданчик", status: "Позже", date: nextFriday },
      { user_id: 2003, nickname: "Денди", status: "Вовремя", date: nextFriday },
      { user_id: 2004, nickname: "Джава", status: "Вовремя", date: nextFriday },
      { user_id: 2005, nickname: "Джокер", status: "Вовремя", date: nextFriday },
      { user_id: 2006, nickname: "Добряк", status: "Вовремя", date: nextFriday },
      { user_id: 2008, nickname: "Матроскина", status: "Вовремя", date: nextFriday },
      { user_id: 2009, nickname: "Перец", status: "Позже", date: nextFriday },
      { user_id: 2010, nickname: "Серый", status: "Вовремя", date: nextFriday },
      { user_id: 2011, nickname: "Стаут", status: "Вовремя", date: nextFriday },
      { user_id: 2015, nickname: "Истина", status: "Вовремя", date: nextFriday }
    ];

    const prevDate = "26.06.2026";
    const games: Game[] = [
      {
        id: 1,
        game_date: prevDate,
        winner_label: "Красные",
        protocol_text: "Победа Красных в угадайке 3в3. Шериф сыграл отлично.",
        game_number: 1,
        global_game_number: 104,
        judge_id: 2006,
        judge_name: "Добряк",
        slots: [
          { slot_num: 1, user_id: 2000, nickname: "Алоэ", role: "Мирный", team: "Красные", base_points: 1, bonus_points: 0.1, lh_points: 0, will_protocol_points: 0, will_opinion_points: 0, dc_points: 0, kick: false, ppk: false, fouls: 1, pu: false, alive: true, status_reason: "Жив", elo_change: 14 },
          { slot_num: 2, user_id: 2001, nickname: "Аннушка", role: "Шериф", team: "Красные", base_points: 1, bonus_points: 0.3, lh_points: 0.5, will_protocol_points: 0, will_opinion_points: 0, dc_points: 0, kick: false, ppk: false, fouls: 0, pu: false, alive: true, status_reason: "Жив", elo_change: 28 },
          { slot_num: 3, user_id: 2002, nickname: "Богданчик", role: "Мафия", team: "Чёрные", base_points: 0, bonus_points: 0, lh_points: 0, will_protocol_points: 0, will_opinion_points: 0, dc_points: 0, kick: false, ppk: false, fouls: 2, pu: false, alive: false, status_reason: "Убит днём", elo_change: -11 },
          { slot_num: 4, user_id: 2003, nickname: "Денди", role: "Мирный", team: "Красные", base_points: 1, bonus_points: 0, lh_points: 0, will_protocol_points: 0, will_opinion_points: 0, dc_points: 0, kick: false, ppk: false, fouls: 1, pu: false, alive: true, status_reason: "Жив", elo_change: 12 },
          { slot_num: 5, user_id: 2004, nickname: "Джава", role: "Дон", team: "Чёрные", base_points: 0, bonus_points: 0, lh_points: 0, will_protocol_points: 0, will_opinion_points: 0, dc_points: 0, kick: false, ppk: false, fouls: 3, pu: false, alive: false, status_reason: "Убит ночью", elo_change: -15 },
          { slot_num: 6, user_id: 2005, nickname: "Джокер", role: "Мирный", team: "Красные", base_points: 1, bonus_points: 0.1, lh_points: 0, will_protocol_points: 0, will_opinion_points: 0, dc_points: 0, kick: false, ppk: false, fouls: 2, pu: true, alive: false, status_reason: "Убит ночью", elo_change: 15 },
          { slot_num: 7, user_id: 2008, nickname: "Матроскина", role: "Мирный", team: "Красные", base_points: 1, bonus_points: 0, lh_points: 0, will_protocol_points: 0, will_opinion_points: 0, dc_points: 0, kick: false, ppk: false, fouls: 1, pu: false, alive: true, status_reason: "Жив", elo_change: 13 },
          { slot_num: 8, user_id: 2009, nickname: "Перец", role: "Мафия", team: "Чёрные", base_points: 0, bonus_points: 0, lh_points: 0, will_protocol_points: 0, will_opinion_points: 0, dc_points: -0.1, kick: false, ppk: false, fouls: 4, pu: false, alive: false, status_reason: "Удален за фолы", elo_change: -18 },
          { slot_num: 9, user_id: 2010, nickname: "Серый", role: "Мирный", team: "Красные", base_points: 1, bonus_points: 0.2, lh_points: 0, will_protocol_points: 0, will_opinion_points: 0, dc_points: 0, kick: false, ppk: false, fouls: 0, pu: false, alive: true, status_reason: "Жив", elo_change: 18 },
          { slot_num: 10, user_id: 2011, nickname: "Стаут", role: "Мирный", team: "Красные", base_points: 1, bonus_points: 0, lh_points: 0, will_protocol_points: 0, will_opinion_points: 0, dc_points: 0, kick: false, ppk: false, fouls: 1, pu: false, alive: true, status_reason: "Жив", elo_change: 12 }
        ]
      },
      {
        id: 2,
        game_date: prevDate,
        winner_label: "Чёрные",
        protocol_text: "Сухая победа чёрных. Дон Джава нашел шерифа на первый круг.",
        game_number: 2,
        global_game_number: 105,
        judge_id: 2010,
        judge_name: "Серый",
        slots: [
          { slot_num: 1, user_id: 2000, nickname: "Алоэ", role: "Мирный", team: "Красные", base_points: 0, bonus_points: 0, lh_points: 0, will_protocol_points: 0, will_opinion_points: 0, dc_points: 0, kick: false, ppk: false, fouls: 2, pu: true, alive: false, status_reason: "Убит ночью", elo_change: -12 },
          { slot_num: 2, user_id: 2001, nickname: "Аннушка", role: "Мирный", team: "Красные", base_points: 0, bonus_points: 0, lh_points: 0, will_protocol_points: 0, will_opinion_points: 0, dc_points: 0, kick: false, ppk: false, fouls: 1, pu: false, alive: false, status_reason: "Убит днём", elo_change: -14 },
          { slot_num: 3, user_id: 2002, nickname: "Богданчик", role: "Мирный", team: "Красные", base_points: 0, bonus_points: 0, lh_points: 0, will_protocol_points: 0, will_opinion_points: 0, dc_points: 0, kick: false, ppk: false, fouls: 2, pu: false, alive: false, status_reason: "Убит днём", elo_change: -11 },
          { slot_num: 4, user_id: 2003, nickname: "Денди", role: "Мафия", team: "Чёрные", base_points: 1, bonus_points: 0.2, lh_points: 0, will_protocol_points: 0, will_opinion_points: 0, dc_points: 0, kick: false, ppk: false, fouls: 1, pu: false, alive: true, status_reason: "Жив", elo_change: 22 },
          { slot_num: 5, user_id: 2004, nickname: "Джава", role: "Дон", team: "Чёрные", base_points: 1, bonus_points: 0.4, lh_points: 0.5, will_protocol_points: 0, will_opinion_points: 0, dc_points: 0, kick: false, ppk: false, fouls: 0, pu: false, alive: true, status_reason: "Жив", elo_change: 32 },
          { slot_num: 6, user_id: 2005, nickname: "Джокер", role: "Мирный", team: "Красные", base_points: 0, bonus_points: 0.1, lh_points: 0.3, will_protocol_points: 0, will_opinion_points: 0, dc_points: 0, kick: false, ppk: false, fouls: 1, pu: false, alive: false, status_reason: "Убит ночью", elo_change: -8 },
          { slot_num: 7, user_id: 2008, nickname: "Матроскина", role: "Мафия", team: "Чёрные", base_points: 1, bonus_points: 0, lh_points: 0, will_protocol_points: 0, will_opinion_points: 0, dc_points: 0, kick: false, ppk: false, fouls: 2, pu: false, alive: true, status_reason: "Жив", elo_change: 18 },
          { slot_num: 8, user_id: 2009, nickname: "Перец", role: "Шериф", team: "Красные", base_points: 0, bonus_points: 0, lh_points: 0, will_protocol_points: 0, will_opinion_points: 0, dc_points: 0, kick: false, ppk: false, fouls: 1, pu: false, alive: false, status_reason: "Убит ночью", elo_change: -14 },
          { slot_num: 9, user_id: 2011, nickname: "Стаут", role: "Мирный", team: "Красные", base_points: 0, bonus_points: 0, lh_points: 0, will_protocol_points: 0, will_opinion_points: 0, dc_points: 0, kick: false, ppk: false, fouls: 2, pu: false, alive: false, status_reason: "Убит днём", elo_change: -13 },
          { slot_num: 10, user_id: 2015, nickname: "Истина", role: "Мирный", team: "Красные", base_points: 0, bonus_points: 0, lh_points: 0, will_protocol_points: 0, will_opinion_points: 0, dc_points: 0, kick: false, ppk: false, fouls: 1, pu: false, alive: false, status_reason: "Убит днём", elo_change: -12 }
        ]
      }
    ];

    const initialDB: DB = {
      players,
      bookings,
      games,
      shop_purchases: []
    };

    fs.writeFileSync(DB_FILE, JSON.stringify(initialDB, null, 2), "utf8");
    return initialDB;
  }
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function saveDB(data: DB) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");
}

// Start Server Setup
async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize DB
  let dbData = loadDB();

  app.use(express.json());

  // ==========================================
  // API ENDPOINTS
  // ==========================================

  // GET Settings/Status (e.g. dynamic calculations)
  app.get("/api/dashboard-stats", (req, res) => {
    dbData = loadDB();
    const totalPlayers = dbData.players.length;
    const totalGames = dbData.games.length;
    const activeBookings = dbData.bookings.filter(b => b.status !== "Отмена").length;
    const totalDebt = dbData.players.reduce((acc, p) => acc + (p.debt < 0 ? Math.abs(p.debt) : 0), 0);

    // ELO leaderboard top 5
    const topElo = [...dbData.players]
      .sort((a, b) => b.elo - a.elo)
      .slice(0, 5)
      .map(p => ({ nickname: p.nickname, elo: p.elo }));

    res.json({
      totalPlayers,
      totalGames,
      activeBookings,
      totalDebt,
      topElo
    });
  });

  // GET Players
  app.get("/api/players", (req, res) => {
    dbData = loadDB();
    res.json(dbData.players);
  });

  // POST Player (Create new player)
  app.post("/api/players", (req, res) => {
    dbData = loadDB();
    const { nickname, full_name, username, elo } = req.body;
    if (!nickname) {
      return res.status(400).json({ error: "Nickname is required" });
    }

    const exists = dbData.players.some(p => p.nickname.toLowerCase() === nickname.toLowerCase());
    if (exists) {
      return res.status(400).json({ error: "Player with this nickname already exists" });
    }

    const newId = dbData.players.length > 0 ? Math.max(...dbData.players.map(p => p.id)) + 1 : 1000;
    const newUserId = dbData.players.length > 0 ? Math.max(...dbData.players.map(p => p.user_id)) + 1 : 2000;

    const newPlayer: Player = {
      id: newId,
      user_id: newUserId,
      nickname,
      full_name: full_name || nickname,
      username: username || "",
      games_played: 0,
      games_won: 0,
      elo: elo || 1500,
      debt: 0,
      total_paid: 0,
      tokens: 0,
      achievements: [],
      last_visit: null
    };

    dbData.players.push(newPlayer);
    saveDB(dbData);
    res.status(201).json(newPlayer);
  });

  // POST Update Player Debt (Settle or modify)
  app.post("/api/players/:id/debt", (req, res) => {
    dbData = loadDB();
    const id = parseInt(req.params.id);
    const { amount, action } = req.body; // action: 'set' or 'change', amount: positive/negative number

    const playerIndex = dbData.players.findIndex(p => p.id === id);
    if (playerIndex === -1) {
      return res.status(404).json({ error: "Player not found" });
    }

    const player = dbData.players[playerIndex];
    if (action === "set") {
      player.debt = -Math.abs(amount); // standard representation of debt is negative
      if (amount === 0) {
        player.debt = 0;
      }
    } else {
      player.debt += amount;
    }

    saveDB(dbData);
    res.json(player);
  });

  // PUT Update Player (Full data editing)
  app.put("/api/players/:id", (req, res) => {
    dbData = loadDB();
    const id = parseInt(req.params.id);
    const playerIndex = dbData.players.findIndex(p => p.id === id);
    if (playerIndex === -1) {
      return res.status(404).json({ error: "Player not found" });
    }

    const player = dbData.players[playerIndex];
    const {
      nickname,
      full_name,
      username,
      games_played,
      games_won,
      elo,
      debt,
      total_paid,
      tokens,
      achievements,
      last_visit
    } = req.body;

    if (nickname) {
      const exists = dbData.players.some(p => p.id !== id && p.nickname.toLowerCase() === nickname.toLowerCase());
      if (exists) {
        return res.status(400).json({ error: "Игрок с таким никнеймом уже существует" });
      }
      player.nickname = nickname;
    }

    if (full_name !== undefined) player.full_name = full_name;
    if (username !== undefined) player.username = username;
    if (games_played !== undefined) player.games_played = parseInt(games_played) || 0;
    if (games_won !== undefined) player.games_won = parseInt(games_won) || 0;
    if (elo !== undefined) player.elo = parseInt(elo) || 1500;
    if (debt !== undefined) player.debt = parseInt(debt) || 0;
    if (total_paid !== undefined) player.total_paid = parseInt(total_paid) || 0;
    if (tokens !== undefined) player.tokens = parseInt(tokens) || 0;
    if (achievements !== undefined) player.achievements = achievements;
    if (last_visit !== undefined) player.last_visit = last_visit;

    saveDB(dbData);
    res.json(player);
  });

  // DELETE Player
  app.delete("/api/players/:id", (req, res) => {
    dbData = loadDB();
    const id = parseInt(req.params.id);
    const playerIndex = dbData.players.findIndex(p => p.id === id);
    if (playerIndex === -1) {
      return res.status(404).json({ error: "Игрок не найден" });
    }

    const deletedPlayer = dbData.players.splice(playerIndex, 1)[0];
    saveDB(dbData);
    res.json({ success: true, deletedPlayer });
  });

  // ==========================================
  // ADMINISTRATIVE DATABASE EDITOR APIS (REST CRUD)
  // ==========================================

  // GET All Shop Purchases
  app.get("/api/admin/purchases", (req, res) => {
    dbData = loadDB();
    res.json(dbData.shop_purchases || []);
  });

  // DELETE Shop Purchase
  app.delete("/api/admin/purchases/:id", (req, res) => {
    dbData = loadDB();
    dbData.shop_purchases = dbData.shop_purchases || [];
    const id = req.params.id;
    const index = dbData.shop_purchases.findIndex(p => p.id === id);
    if (index === -1) {
      return res.status(404).json({ error: "Запись покупки не найдена" });
    }
    const deleted = dbData.shop_purchases.splice(index, 1)[0];
    saveDB(dbData);
    res.json({ success: true, deleted });
  });

  // PUT Edit Shop Purchase
  app.put("/api/admin/purchases/:id", (req, res) => {
    dbData = loadDB();
    dbData.shop_purchases = dbData.shop_purchases || [];
    const id = req.params.id;
    const index = dbData.shop_purchases.findIndex(p => p.id === id);
    if (index === -1) {
      return res.status(404).json({ error: "Запись покупки не найдена" });
    }
    const { nickname, item_name, price, timestamp } = req.body;
    const purchase = dbData.shop_purchases[index];
    if (nickname !== undefined) purchase.nickname = nickname;
    if (item_name !== undefined) purchase.item_name = item_name;
    if (price !== undefined) purchase.price = parseInt(price) || 0;
    if (timestamp !== undefined) purchase.timestamp = timestamp;

    saveDB(dbData);
    res.json(purchase);
  });

  // PUT Edit Booking (Admin)
  app.put("/api/admin/bookings", (req, res) => {
    dbData = loadDB();
    const { oldNickname, oldDate, user_id, nickname, status, date } = req.body;
    const index = dbData.bookings.findIndex(
      b => b.nickname.toLowerCase() === oldNickname.toLowerCase() && b.date === oldDate
    );
    if (index === -1) {
      return res.status(404).json({ error: "Запись бронирования не найдена" });
    }
    const booking = dbData.bookings[index];
    if (user_id !== undefined) booking.user_id = parseInt(user_id) || booking.user_id;
    if (nickname !== undefined) booking.nickname = nickname;
    if (status !== undefined) booking.status = status;
    if (date !== undefined) booking.date = date;

    saveDB(dbData);
    res.json(booking);
  });

  // DELETE Booking (Admin)
  app.delete("/api/admin/bookings", (req, res) => {
    dbData = loadDB();
    const { nickname, date } = req.query;
    if (!nickname || !date) {
      return res.status(400).json({ error: "Nickname and date are required" });
    }
    const index = dbData.bookings.findIndex(
      b => b.nickname.toLowerCase() === (nickname as string).toLowerCase() && b.date === date
    );
    if (index === -1) {
      return res.status(404).json({ error: "Запись бронирования не найдена" });
    }
    const deleted = dbData.bookings.splice(index, 1)[0];
    saveDB(dbData);
    res.json({ success: true, deleted });
  });

  // PUT Edit Game History (Admin)
  app.put("/api/admin/games/:id", (req, res) => {
    dbData = loadDB();
    const id = parseInt(req.params.id);
    const index = dbData.games.findIndex(g => g.id === id);
    if (index === -1) {
      return res.status(404).json({ error: "Игра не найдена" });
    }
    const game = dbData.games[index];
    const { game_date, winner_label, protocol_text, judge_name, global_game_number } = req.body;

    if (game_date !== undefined) game.game_date = game_date;
    if (winner_label !== undefined) game.winner_label = winner_label;
    if (protocol_text !== undefined) game.protocol_text = protocol_text;
    if (judge_name !== undefined) game.judge_name = judge_name;
    if (global_game_number !== undefined) game.global_game_number = parseInt(global_game_number) || game.global_game_number;

    saveDB(dbData);
    res.json(game);
  });

  // DELETE Game History (Admin)
  app.delete("/api/admin/games/:id", (req, res) => {
    dbData = loadDB();
    const id = parseInt(req.params.id);
    const index = dbData.games.findIndex(g => g.id === id);
    if (index === -1) {
      return res.status(404).json({ error: "Игра не найдена" });
    }
    const deleted = dbData.games.splice(index, 1)[0];
    saveDB(dbData);
    res.json({ success: true, deleted });
  });

  // POST Create Player (Admin / Manual adding)
  app.post("/api/admin/players", (req, res) => {
    dbData = loadDB();
    const { nickname, full_name, username, elo, games_played, games_won, tokens, debt } = req.body;
    if (!nickname) {
      return res.status(400).json({ error: "Никнейм обязателен" });
    }
    const exists = dbData.players.some(p => p.nickname.toLowerCase() === nickname.toLowerCase());
    if (exists) {
      return res.status(400).json({ error: "Игрок с таким никнеймом уже существует" });
    }

    const nextId = dbData.players.length > 0 ? Math.max(...dbData.players.map(p => p.id)) + 1 : 1000;
    const nextUserId = dbData.players.length > 0 ? Math.max(...dbData.players.map(p => p.user_id)) + 1 : 2000;

    const newPlayer = {
      id: nextId,
      user_id: nextUserId,
      nickname,
      full_name: full_name || "",
      username: username || "",
      elo: parseInt(elo) || 1500,
      games_played: parseInt(games_played) || 0,
      games_won: parseInt(games_won) || 0,
      tokens: parseInt(tokens) || 0,
      debt: parseInt(debt) || 0,
      achievements: [],
      last_visit: null
    };

    dbData.players.push(newPlayer);
    saveDB(dbData);
    res.status(201).json(newPlayer);
  });

  // GET Bookings
  app.get("/api/bookings", (req, res) => {
    dbData = loadDB();
    res.json(dbData.bookings);
  });

  // POST Create/Update Booking
  app.post("/api/bookings", (req, res) => {
    dbData = loadDB();
    const { user_id, nickname, status } = req.body;
    if (!nickname) {
      return res.status(400).json({ error: "Nickname is required" });
    }

    const dateStr = getNextFridayDateStr();
    const existingIndex = dbData.bookings.findIndex(b => b.nickname.toLowerCase() === nickname.toLowerCase());

    const finalUserId = user_id || (dbData.players.find(p => p.nickname.toLowerCase() === nickname.toLowerCase())?.user_id || 9999);

    if (existingIndex !== -1) {
      if (status === "Отмена") {
        dbData.bookings.splice(existingIndex, 1);
      } else {
        dbData.bookings[existingIndex].status = status;
        dbData.bookings[existingIndex].date = dateStr;
      }
    } else {
      if (status !== "Отмена") {
        dbData.bookings.push({
          user_id: finalUserId,
          nickname,
          status,
          date: dateStr
        });
      }
    }

    saveDB(dbData);
    res.json(dbData.bookings);
  });

  // POST End-of-Evening Billing & Booking Archive
  app.post("/api/bookings/archive", (req, res) => {
    dbData = loadDB();
    const dateStr = getNextFridayDateStr();
    const activeBooked = [...dbData.bookings];

    if (activeBooked.length === 0) {
      return res.status(400).json({ error: "No players booked for this evening" });
    }

    let billsCount = 0;
    const billsDetails: string[] = [];

    activeBooked.forEach(booking => {
      const player = dbData.players.find(p => p.user_id === booking.user_id || p.nickname.toLowerCase() === booking.nickname.toLowerCase());
      if (player) {
        // 1. Give tokens for booking
        const tokensAwarded = booking.status === "Вовремя" ? 500 : booking.status === "Позже" ? 400 : 0;
        player.tokens += tokensAwarded;

        // 2. Compute cost of the games played this evening
        // Count games played on the dateStr
        const gamesPlayedThisEvening = dbData.games
          .filter(g => g.game_date === dateStr)
          .reduce((sum, g) => {
            const hasPlayed = g.slots.some(s => s.user_id === player.user_id);
            return sum + (hasPlayed ? 1 : 0);
          }, 0);

        // Calculate cost: 100 per game, max 400
        const eveningCost = Math.min(gamesPlayedThisEvening * 100, 400);

        if (eveningCost > 0) {
          player.debt -= eveningCost; // Add to debt (represented as negative)
          player.last_visit = `${dateStr} 21:00`;
          billsDetails.push(`${player.nickname}: +${tokensAwarded}🪙 (booking), ${gamesPlayedThisEvening} games played -> ${eveningCost}₽ debt added`);
          billsCount++;
        }
      }
    });

    // Clear active bookings for the next session
    dbData.bookings = [];
    saveDB(dbData);

    res.json({
      success: true,
      message: `Evening archived successfully. Bills sent to ${billsCount} players.`,
      details: billsDetails
    });
  });

  // GET Games History
  app.get("/api/games", (req, res) => {
    dbData = loadDB();
    res.json(dbData.games);
  });

  // POST Record New Game with ELO calculation & Achievements distribution
  app.post("/api/games", (req, res) => {
    dbData = loadDB();
    const { winning_team, protocol_text, judge_id, slots } = req.body;

    if (!winning_team || !slots || slots.length < 4) {
      return res.status(400).json({ error: "Incomplete game data. Need winning team and at least 4 player slots." });
    }

    const gameDate = getNextFridayDateStr();
    const nextGameId = dbData.games.length > 0 ? Math.max(...dbData.games.map(g => g.id)) + 1 : 1;
    const globalGameNo = dbData.games.length > 0 ? Math.max(...dbData.games.map(g => g.global_game_number)) + 1 : 100;
    const localGameNo = dbData.games.filter(g => g.game_date === gameDate).length + 1;

    const judgePlayer = dbData.players.find(p => p.user_id === judge_id);
    const judge_name = judgePlayer ? judgePlayer.nickname : "Admin";

    // 1. Gather all players with old ELO to prepare calculation
    const teamElos: { [team: string]: number[] } = { "Красные": [], "Чёрные": [] };
    const calculatedSlots: GameSlot[] = [];

    const slotPlayersMap = slots.map((s: any) => {
      const player = dbData.players.find(p => p.user_id === s.user_id);
      const currentElo = player ? player.elo : 1500;
      teamElos[s.team as "Красные" | "Чёрные"].push(currentElo);
      return {
        slot: s,
        player,
        currentElo
      };
    });

    const K_FACTOR = 32;
    const BONUS_TO_ELO_RATIO = 10;

    const calculatedResults = slotPlayersMap.map((item: any) => {
      const { slot, player, currentElo } = item;
      const isWin = slot.team === winning_team;

      // Opponent team average
      const opponentTeam = slot.team === "Красные" ? "Чёрные" : "Красные";
      const opponentElos = teamElos[opponentTeam];
      const opponentAvg = opponentElos.length > 0 ? opponentElos.reduce((a, b) => a + b, 0) / opponentElos.length : 1500;

      // ELO Expected Score
      const expected = 1 / (1 + Math.pow(10, (opponentAvg - currentElo) / 400));
      const actual = isWin ? 1.0 : 0.0;
      const rawDelta = K_FACTOR * (actual - expected);

      // Role coefficient
      let roleMod = 1.0;
      if (isWin) {
        roleMod = slot.team === "Красные" ? 1.2 : 0.9;
      } else {
        roleMod = slot.team === "Красные" ? 0.9 : 1.1;
      }

      // Carry coefficient
      let carryMod = 1.0;
      const myTeamElos = teamElos[slot.team as "Красные" | "Чёрные"];
      if (myTeamElos.length >= 2) {
        const teamAvg = myTeamElos.reduce((a, b) => a + b, 0) / myTeamElos.length;
        const diff = currentElo - teamAvg;
        const normalized = Math.min(1.0, Math.max(-1.0, diff / 200));
        if (isWin) {
          carryMod = diff > 0 ? (1 + normalized * 0.3) : (1 - Math.abs(normalized) * 0.2);
        } else {
          carryMod = diff > 0 ? (1 - normalized * 0.4) : (1 + Math.abs(normalized) * 0.2);
        }
      }

      // Base Game ELO delta
      const gameDelta = Math.round(rawDelta * roleMod * carryMod);

      // Bonus ELO delta (extra points total * 10)
      const totalBonus = parseFloat(slot.bonus_points || 0) +
                         parseFloat(slot.lh_points || 0) +
                         parseFloat(slot.will_protocol_points || 0) +
                         parseFloat(slot.will_opinion_points || 0) +
                         parseFloat(slot.dc_points || 0);
      const bonusDelta = Math.round(totalBonus * BONUS_TO_ELO_RATIO);

      const totalDelta = gameDelta + bonusDelta;
      const newElo = Math.max(1000, currentElo + totalDelta); // Elo floor is 1000

      // Update Player Stats in DB
      let newlyEarnedAchievements: string[] = [];
      if (player) {
        player.games_played += 1;
        if (isWin) player.games_won += 1;
        player.elo = newElo;

        // Reward Tokens: +100 participation, +100 win, extra bonus points -> 0.1 = 10 tokens
        let gameTokens = 100;
        if (isWin) gameTokens += 100;
        gameTokens += Math.round(totalBonus * 100);
        if (slot.fouls === 0) gameTokens += 15; // clean play bonus
        player.tokens += gameTokens;

        // Verify and award achievements
        const currentEarned = new Set(player.achievements);

        Object.entries(ACHIEVEMENTS).forEach(([achId, ach]) => {
          if (currentEarned.has(achId)) return;

          let earned = false;
          if (ach.type === "games" && player.games_played >= (ach.value as number)) {
            earned = true;
          } else if (ach.type === "wins" && player.games_won >= (ach.value as number)) {
            earned = true;
          } else if (ach.type === "rating" && player.elo >= (ach.value as number)) {
            earned = true;
          } else if (ach.type === "role" && isWin && slot.role === ach.value) {
            earned = true;
          } else if (ach.type === "special" && achId === "pu_once" && slot.pu) {
            earned = true;
          }

          if (earned) {
            player.achievements.push(achId);
            newlyEarnedAchievements.push(achId);
          }
        });
      }

      const calculatedSlot: GameSlot = {
        slot_num: slot.slot_num,
        user_id: slot.user_id,
        nickname: slot.nickname,
        role: slot.role,
        team: slot.team,
        base_points: isWin ? 1 : 0,
        bonus_points: parseFloat(slot.bonus_points || 0),
        lh_points: parseFloat(slot.lh_points || 0),
        will_protocol_points: parseFloat(slot.will_protocol_points || 0),
        will_opinion_points: parseFloat(slot.will_opinion_points || 0),
        dc_points: parseFloat(slot.dc_points || 0),
        kick: slot.kick || false,
        ppk: slot.ppk || false,
        fouls: slot.fouls || 0,
        pu: slot.pu || false,
        alive: slot.alive || false,
        status_reason: slot.status_reason || "Жив",
        elo_change: totalDelta
      };

      return {
        calculatedSlot,
        newlyEarnedAchievements,
        nickname: slot.nickname
      };
    });

    // Award achievement to judge as well!
    if (judgePlayer) {
      const judgedCount = dbData.games.filter(g => g.judge_id === judge_id).length + 1;
      const judgeEarned = new Set(judgePlayer.achievements);
      const judgeAchievements = [
        { id: "first_judge", val: 1 },
        { id: "five_judged", val: 5 },
        { id: "ten_judged", val: 10 },
        { id: "twenty_judged", val: 20 },
        { id: "fifty_judged", val: 50 }
      ];

      judgeAchievements.forEach(ach => {
        if (!judgeEarned.has(ach.id) && judgedCount >= ach.val) {
          judgePlayer.achievements.push(ach.id);
        }
      });
    }

    const finalSlots = calculatedResults.map(r => r.calculatedSlot);
    const newGame: Game = {
      id: nextGameId,
      game_date: gameDate,
      winner_label: winning_team,
      protocol_text: protocol_text || "",
      game_number: localGameNo,
      global_game_number: globalGameNo,
      judge_id,
      judge_name,
      slots: finalSlots
    };

    dbData.games.push(newGame);
    saveDB(dbData);

    const achievementsUnlocked = calculatedResults
      .filter(r => r.newlyEarnedAchievements.length > 0)
      .map(r => ({
        nickname: r.nickname,
        unlocked: r.newlyEarnedAchievements.map(id => (ACHIEVEMENTS as any)[id])
      }));

    res.status(201).json({
      game: newGame,
      achievementsUnlocked
    });
  });

  // GET Shop Items
  app.get("/api/shop-items", (req, res) => {
    const SHOP_ITEMS: ShopItem[] = [
      { id: "buy_role", name: "Купить роль на игру", description: "Выбрать роль перед началом игры (Мирный / Мафия / Шериф / Дон)", price: 10000, type: "role", icon: "🎭" },
      { id: "order_music", name: "Заказ музыки", description: "2 песни на вечер игры (раздача и договорённость)", price: 5000, type: "music", icon: "🎵" },
      { id: "free_evening", name: "Бесплатный вечер", description: "Один вечер игры бесплатно (освобождение от оплаты за игры)", price: 30000, type: "free_evening", icon: "🎟️" }
    ];
    res.json(SHOP_ITEMS);
  });

  // POST Purchase Shop Item
  app.post("/api/shop-purchase", (req, res) => {
    dbData = loadDB();
    const { player_id, item_id } = req.body;

    const playerIndex = dbData.players.findIndex(p => p.id === player_id);
    if (playerIndex === -1) {
      return res.status(404).json({ error: "Player not found" });
    }

    const player = dbData.players[playerIndex];

    const SHOP_ITEMS: { [key: string]: any } = {
      "buy_role": { name: "Купить роль на игру", price: 10000, icon: "🎭" },
      "order_music": { name: "Заказ музыки", price: 5000, icon: "🎵" },
      "free_evening": { name: "Бесплатный вечер", price: 30000, icon: "🎟️" }
    };

    const item = SHOP_ITEMS[item_id];
    if (!item) {
      return res.status(404).json({ error: "Item not found in shop" });
    }

    if (player.tokens < item.price) {
      return res.status(400).json({ error: `Insufficient tokens! Required: ${item.price}, Available: ${player.tokens}` });
    }

    // Deduct tokens
    player.tokens -= item.price;

    const purchase: ShopPurchase = {
      id: Math.random().toString(36).substring(2, 9),
      user_id: player.user_id,
      nickname: player.nickname,
      item_id,
      item_name: item.name,
      price: item.price,
      timestamp: new Date().toLocaleString("ru-RU")
    };

    dbData.shop_purchases = dbData.shop_purchases || [];
    dbData.shop_purchases.push(purchase);

    // Apply setting/marker to player if free_evening or role buy
    if (item_id === "free_evening") {
      player.debt = 0; // instantly clears current debt
    }

    saveDB(dbData);
    res.json({
      success: true,
      player,
      purchase
    });
  });

  // GET Achievements database
  app.get("/api/achievements-list", (req, res) => {
    res.json(ACHIEVEMENTS);
  });

  // ==========================================
  // VITE & STATIC FILES
  // ==========================================

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server", err);
});
