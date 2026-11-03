import ReactDOM from 'react-dom/client';
import LiveBroadcastOverlay from '../src/components/public/LiveBroadcastOverlay.tsx';
import { buildDealBroadcastState } from '../src/lib/liveBroadcastDeal.ts';
import './appStyles.ts';

// The role deal on the stream: seat 3 chooses, two cards are taken, the chosen card (?open=0 keeps it closed) shows the Sheriff.
const names = ['Богданчик', 'Алоэ', 'Дина', 'Знак', 'Тень', 'Маша', 'Игорь', 'Вера', 'Чагин', 'Дон Эль'];
const players = names.map((nickname, index) => ({ seat: index + 1, playerId: `p${index + 1}`, nickname }));
const open = new URLSearchParams(location.search).get('open') !== '0';
const state = buildDealBroadcastState({ gameId: 1, globalGameNumber: 12, eveningGameNumber: 2, tableName: 'Основной стол', players }, {
  seat: 3,
  cards: Array.from({ length: 10 }, (_, index) => ({ position: index + 1, taken: index === 1 || index === 7 })),
  open: open ? { position: 5, role: 'sheriff' } : null,
});

globalThis.fetch = async () => new Response(JSON.stringify({ connected: true, receivedAt: new Date().toISOString(), state }), { status: 200, headers: { 'Content-Type': 'application/json' } });
ReactDOM.createRoot(document.getElementById('root')!).render(<LiveBroadcastOverlay token="preview" />);
