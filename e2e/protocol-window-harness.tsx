import ReactDOM from 'react-dom/client';
import { useState } from 'react';
import { EveningGameProtocolModal } from '../src/components/crm/EveningGameProtocolModal.tsx';
import { GameProtocolModal } from '../src/components/crm/tournaments/GameProtocolModal.tsx';
import { buildProtocolWindowGame } from './fixtures/protocolWindowGame.ts';
import '../src/index.css';
import '../src/styles/design-system.css';

const params = new URLSearchParams(window.location.search);
const game: any = buildProtocolWindowGame(params.get('draft') ? 'draft' : 'completed');
const realFetch = window.fetch.bind(window);
// The real save response joins canonical seats/players back onto input-only mutable result fields.
const savedResults = (rows: any[]) => rows.map((row) => ({ ...game.club_protocol.player_results.find((player: any) => player.participant_id === row.participant_id), ...row }));
(window as any).__saves = [];
(window as any).__offline = params.get('offline') === '1';
window.fetch = (async (input: any, init?: any) => {
  const url = String(input);
  if ((window as any).__offline && (init?.method === 'PUT' || init?.method === 'POST')) return new Response(JSON.stringify({ error: 'Нет сети' }), { status: 503, headers: { 'content-type': 'application/json' } });
  if (url.includes('/evening-protocol')) {
    const body = JSON.parse(init.body);
    (window as any).__saves.push(body);
    return new Response(JSON.stringify({ ...game, status: body.protocol.status, club_protocol: { ...game.club_protocol, protocol: body.protocol, player_results: savedResults(body.player_results) } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (url.includes('/api/tournaments/t/games/g/protocol')) {
    if (init?.method === 'PUT' || init?.method === 'POST') {
      const body = JSON.parse(init.body);
      (window as any).__saves.push(body);
      return new Response(JSON.stringify({ game: { id: 'g', game_number: 21, judge_name: 'Судья' }, protocol: body.protocol, player_results: savedResults(body.player_results) }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ game: { id: 'g', game_number: 21, judge_name: 'Судья' }, protocol: game.club_protocol.protocol, player_results: game.club_protocol.player_results }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (url.includes('/api/tournaments/t')) return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
  if (url.includes('/api/players')) return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
  return realFetch(input, init);
}) as typeof window.fetch;

function ProtocolPreview() {
  const [open, setOpen] = useState(true);
  if (!open) return <p data-testid="protocol-closed">Протокол закрыт</p>;
  return params.get('kind') === 'tournament' ? <GameProtocolModal tournamentId="t" gameId="g" isOpen onClose={() => setOpen(false)} /> : <EveningGameProtocolModal game={game} isOpen onClose={() => setOpen(false)} onUpdated={() => undefined} />;
}
ReactDOM.createRoot(document.getElementById('root')!).render(<ProtocolPreview />);

