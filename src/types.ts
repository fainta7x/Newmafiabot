import type { StoredEveningFormat } from './lib/eveningFormat.ts';

export type EveningFormat = StoredEveningFormat;

export interface Player {
  id: number;
  user_id: number;
  nickname: string;
  full_name: string;
  username: string;
  games_played: number;
  games_won: number;
  elo: number;
  debt: number; // negative number means they owe money, e.g. -200 means 200 rubles debt
  total_paid: number;
  tokens: number;
  achievements: string[];
  last_visit: string | null;
  tag?: "Регуляр" | "Новичок" | "Судья" | "VIP" | "Организатор" | "Заблокирован";
  notes?: string;
  rookie_elo?: number;
  tournament_points?: number;
  tournament_games?: number;
  tournament_wins?: number;
}

export interface GameEvening {
  id: string;
  date: string;
  title: string;
  status: "Запланирован" | "Идет сейчас" | "Завершен";
  location?: string;
  notes?: string;
  format?: EveningFormat;
  format_rules?: string;
  elo_multiplier?: number;
}

export interface Booking {
  user_id: number;
  nickname: string;
  status: "Вовремя" | "Позже" | "Отмена" | "Не пришел";
  date: string;
  evening_id?: string;
  payment?: number; // Оплата за вечер (100, 200, 300, 400 или вручную)
  payment_status?: "Оплачено" | "В долг" | "Частично" | "Не пришел";
}

export interface GameSlot {
  slot_num: number;
  user_id: number;
  nickname: string;
  role: "Мирный" | "Шериф" | "Мафия" | "Дон";
  team: "Красные" | "Чёрные";
  base_points: number; // 1 for win, 0 for loss
  bonus_points: number; // e.g. 0.1 to 0.5
  lh_points: number; // best move/best player points
  will_protocol_points: number;
  will_opinion_points: number;
  dc_points: number; // disciplinary/criticism points
  kick: boolean;
  ppk: boolean; // personal suicide/leave
  fouls: number; // 0 to 4
  pu: boolean; // best move slot
  alive: boolean;
  status_reason: string;
  elo_change: number;
}

export interface Game {
  id: number;
  game_date: string;
  winner_label: "Красные" | "Чёрные";
  protocol_text: string;
  game_number: number;
  global_game_number: number;
  judge_id: number;
  judge_name: string;
  slots: GameSlot[];
  format?: EveningFormat;
  tournament_stage?: string;
}

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  price: number;
  type: string;
  icon: string;
}

export interface ShopPurchase {
  id: string;
  user_id: number;
  nickname: string;
  item_id: string;
  item_name: string;
  price: number;
  timestamp: string;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  type: "games" | "wins" | "rating" | "judged" | "role" | "special";
  value: number | string;
}

export interface FinancialTransaction {
  id: string;
  type: "income" | "expense";
  amount: number;
  category: "Взнос за вечер" | "Турнирный сбор" | "Оплата долга" | "Внутриклубная покупка" | "Аренда помещения" | "Закупка инвентаря" | "Призовой фонд" | "Прочее";
  description: string;
  player_id?: number;
  nickname?: string;
  timestamp: string;
  payment_method?: "Наличные" | "Перевод / Карта" | "Внутренний баланс";
}

export interface OrganizerTask {
  id: string;
  title: string;
  description?: string;
  category: "Подготовка" | "Закупки" | "Оплата/Касса" | "Реквизит" | "Прочее";
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  due_date?: string;
  assigned_to?: string;
}

