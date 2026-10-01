import ReactDOM from 'react-dom/client';
import PlayerPoker from '../src/components/player/PlayerPoker.tsx';
import '../src/index.css';

// ?players=6&board=3 shows a fuller table for visual checks; the default stays the CI scene.
const params = new URLSearchParams(location.search);
const extraNames = ['Бот Скала', 'Бот Акула', 'Бот Профи', 'Бот Ниндзя', 'Бот Фортуна'];
const players = [
  { id: 'viewer', nickname: 'Чагин', seat: 1, chips: 980 },
  { id: 'bot-lucky', nickname: 'Бот Лаки', seat: 2, chips: 1080, is_bot: true },
  { id: 'bot-bluff', nickname: 'Бот Блеф', seat: 3, chips: 890, is_bot: true },
  ...extraNames.slice(0, Math.max(0, Number(params.get('players') || 3) - 3)).map((nickname, index) => ({ id: `bot-${index}`, nickname, seat: index + 4, chips: 1000 + index * 150, is_bot: true })),
];
const boardCards = [{ rank: 'Q', suit: 'hearts' }, { rank: '10', suit: 'diamonds' }, { rank: '7', suit: 'spades' }, { rank: 'A', suit: 'clubs' }, { rank: '2', suit: 'hearts' }].slice(0, Number(params.get('board') || 0));

const lobby = {
  id: 'visual-table',
  title: 'Открытая покерная комната',
  status: 'playing',
  players,
  hand: {
    viewer_id: 'viewer',
    street: 'preflop',
    small_blind: 10,
    big_blind: 20,
    dealer_seat: 1,
    small_blind_seat: 3,
    big_blind_seat: 2,
    current_seat: 3,
    current_bet: 20,
    pot: 50,
    base_turn_seconds: 20,
    max_reserve_seconds: 60,
    turn_remaining: { base_seconds: 16, reserve_seconds: 60 },
    is_viewer_turn: false,
    waiting_for_next_hand: false,
    board: boardCards,
    hole_cards: {
      viewer: [{ rank: 'J', suit: 'clubs' }, { rank: '10', suit: 'spades' }],
      'bot-lucky': [],
      'bot-bluff': [],
    },
    players: players.map((player, index) => ({ ...player, committed: index === 1 ? 20 : index === 2 ? 10 : index > 3 ? 20 : 0, folded: index === 3, all_in: false })),
    action_log: [{ player_id: 'bot-lucky', street: 'preflop', type: 'call', amount: 20, at: '2026-10-02T00:00:00.000Z' }],
    hand_label: 'Старшая карта: валет, кикер десятка',
    showdown_labels: {},
    winning_cards: [],
    winner_ids: [],
    available_actions: {
      can_fold: false,
      can_check: false,
      can_call: false,
      can_bet: false,
      to_call: 20,
      call_amount: 20,
      min_bet_total: 40,
      max_bet_total: 980,
    },
  },
};

globalThis.fetch = async (input, init) => {
  const url = String(input);
  const body = url.endsWith('/api/player/poker/lobbies') && (!init?.method || init.method === 'GET')
    ? { lobbies: [] }
    : { lobby };
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

document.documentElement.style.setProperty('--tg-viewport-stable-height', '844px');

ReactDOM.createRoot(document.getElementById('root')!).render(<PlayerPoker onExit={() => undefined} />);
