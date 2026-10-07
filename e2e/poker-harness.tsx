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
  ownerId: 'viewer',
  status: 'playing',
  money_mode: 'club_tokens',
  players,
  hand: {
    id: 'visual-hand',
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
    hand_label: 'Старшая карта: валет',
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

const history = [{
  id: 'h1', number: 1, at: 0, small_blind: 10, big_blind: 20, pot: 240, winner_ids: ['bot-bluff'],
  board: [{ rank: 'K', suit: 'spades' }, { rank: '9', suit: 'hearts' }, { rank: '4', suit: 'clubs' }, { rank: 'K', suit: 'diamonds' }, { rank: '2', suit: 'spades' }],
  players: [
    { id: 'viewer', nickname: 'Чагин', seat: 1, cards: [{ rank: 'Q', suit: 'hearts' }, { rank: 'Q', suit: 'clubs' }], revealed: true, net: -120, label: 'Две пары: короли и дамы' },
    { id: 'bot-bluff', nickname: 'Бот Блеф', seat: 3, cards: [{ rank: 'K', suit: 'hearts' }, { rank: '9', suit: 'clubs' }], revealed: true, net: 130, label: 'Фулл-хаус: короли и девятки' },
    { id: 'bot-lucky', nickname: 'Бот Лаки', seat: 2, cards: [], revealed: false, net: -10, label: null },
  ],
  actions: [
    { street: 'preflop', player_id: 'bot-bluff', player_name: 'Бот Блеф', type: 'small_blind', amount: 10 },
    { street: 'preflop', player_id: 'bot-lucky', player_name: 'Бот Лаки', type: 'big_blind', amount: 20 },
    { street: 'preflop', player_id: 'viewer', player_name: 'Чагин', type: 'raise', amount: 60 },
    { street: 'preflop', player_id: 'bot-bluff', player_name: 'Бот Блеф', type: 'call', amount: 50 },
    { street: 'flop', player_id: 'bot-bluff', player_name: 'Бот Блеф', type: 'check', amount: 0 },
    { street: 'flop', player_id: 'viewer', player_name: 'Чагин', type: 'bet', amount: 60 },
    { street: 'flop', player_id: 'bot-bluff', player_name: 'Бот Блеф', type: 'call', amount: 60 },
  ],
}];

// ?waiting=1: the permanent «Общий стол» with one player, before the first deal.
if (params.get('waiting')) Object.assign(lobby, { title: 'Общий стол', permanent: true, ownerId: '', status: 'waiting', players: players.slice(0, 1), hand: null, viewer_id: 'viewer' });

globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url.endsWith('/history')) return new Response(JSON.stringify({ history }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const body = url.endsWith('/api/player/poker/lobbies') && (!init?.method || init.method === 'GET')
    ? { lobbies: [] }
    : { lobby };
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

document.documentElement.style.setProperty('--tg-viewport-stable-height', `${window.innerHeight}px`);

ReactDOM.createRoot(document.getElementById('root')!).render(<PlayerPoker onExit={() => undefined} />);
