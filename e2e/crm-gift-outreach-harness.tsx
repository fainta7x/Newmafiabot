import ReactDOM from 'react-dom/client';
import { GiftCollectionCRM } from '../src/components/crm/GiftCollectionCRM.tsx';
import './appStyles.ts';

const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (input: RequestInfo | URL) => {
  const value = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const url = new URL(value, location.origin);
  if (url.pathname === '/api/gift-collections') return response([{ id: 'gift-1', honoree_player_id: 'birthday', honoree_nickname: 'Очень длинный игровой ник именинника', status: 'open', created_at: '2026-10-30' }]);
  if (url.pathname === '/api/gift-collections/gift-1') return response({
    collection: { id: 'gift-1', honoree_player_id: 'birthday', honoree_nickname: 'Очень длинный игровой ник именинника', status: 'open' },
    totals: { pledged: 300, paid: 200 },
    contributions: [{ player_id: 'player-1', nickname: 'Игрок с длинным никнеймом', contact_url: 'https://vk.com/id123', status: 'invited', channel: 'vk_manual', pledged_amount: 0, paid_amount: 0 },
    { player_id: 'player-2', nickname: 'Переведу завтра', contact_url: 'https://t.me/testuser', status: 'pledged', channel: 'telegram', pledged_amount: 300, paid_amount: 0 },
    { player_id: 'player-3', nickname: 'Оплатил', contact_url: null, status: 'paid', channel: 'none', pledged_amount: 200, paid_amount: 200 },
    { player_id: 'player-4', nickname: 'Отказался', contact_url: null, status: 'declined', channel: 'none', pledged_amount: 0, paid_amount: 0 }] });
  return response([]);
};
history.replaceState(null, '', '/e2e/crm-gift-outreach.html?collection=gift-1');
ReactDOM.createRoot(document.getElementById('root')!).render(<main className="crm-premium min-h-screen bg-app-bg p-3"><GiftCollectionCRM /></main>);
