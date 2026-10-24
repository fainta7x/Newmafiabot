import ReactDOM from 'react-dom/client';
import { EveningGameProtocolModal } from '../src/components/crm/EveningGameProtocolModal.tsx';
import { buildProtocolWindowGame } from './fixtures/protocolWindowGame.ts';
import '../src/index.css';
import '../src/styles/design-system.css';

const params = new URLSearchParams(window.location.search);
const game: any = buildProtocolWindowGame(params.get('draft') ? 'draft' : 'completed');
const realFetch = window.fetch.bind(window);
(window as any).__saves = [];
window.fetch = (async (input: any, init?: any) => {
  const url = String(input);
  if (url.includes('/evening-protocol')) {
    const body = JSON.parse(init.body);
    (window as any).__saves.push(body);
    return new Response(JSON.stringify({ ...game, status: body.protocol.status, club_protocol: { ...game.club_protocol, protocol: body.protocol, player_results: body.player_results } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (url.includes('/api/players')) return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
  return realFetch(input, init);
}) as typeof window.fetch;

ReactDOM.createRoot(document.getElementById('root')!).render(<EveningGameProtocolModal game={game} isOpen onClose={() => undefined} onUpdated={() => undefined} />);
