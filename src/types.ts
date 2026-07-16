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
}

export interface Booking {
  user_id: number;
  nickname: string;
  status: "Вовремя" | "Позже" | "Отмена";
  date: string;
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
