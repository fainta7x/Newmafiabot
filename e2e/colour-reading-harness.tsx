import ReactDOM from 'react-dom/client';
import ColourReadingPanel from '../src/components/player/ColourReadingPanel.tsx';
import './appStyles.ts';

// «Читать цвет» (owner-approved mock-up, 2026-11-03): four tabs of top-3 cards; one list is empty on purpose.
const p = (id: string, nickname: string, count: number) => ({ playerId: id, nickname, count });
const lists = {
  mine_correct: [p('a', 'Богданчик', 9), p('b', 'Матроскина', 6), p('c', 'Пристань', 4)],
  mine_wrong: [p('d', 'Шторм Длинноникович Третий', 7), p('e', 'Перец', 5), p('f', 'Дина', 3)],
  mine_don: [p('g', 'Солнце', 4), p('d', 'Шторм Длинноникович Третий', 3)],
  mine_sheriff: [],
  me_correct: [p('h', 'Крот', 8), p('a', 'Богданчик', 5), p('i', 'Лис', 2)],
  me_wrong: [p('j', 'Ворон', 6), p('k', 'Диссонанс', 4), p('b', 'Матроскина', 3)],
  mafia_against: [p('h', 'Крот', 5), p('l', 'Вид', 3), p('a', 'Богданчик', 2)],
  mafia_with: [p('e', 'Перец', 6), p('f', 'Дина', 4), p('d', 'Шторм Длинноникович Третий', 2)],
  don_against: [p('a', 'Богданчик', 3)],
  don_with: [p('b', 'Матроскина', 4), p('e', 'Перец', 3), p('m', 'Сова', 2)],
};
globalThis.fetch = async () => new Response(JSON.stringify({ games: 22, lists }), { status: 200, headers: { 'Content-Type': 'application/json' } });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <div className="min-h-screen bg-[#0b0b0d] p-4 text-white"><div className="mx-auto max-w-3xl"><ColourReadingPanel url="/api/player/colour-reading" /></div></div>,
);
