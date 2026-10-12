import ReactDOM from 'react-dom/client';
import PlayerGoMafiaLink from '../src/components/player/PlayerGoMafiaLink.tsx';
import career from '../src/tests/fixtures/gomafia/chagin-career.json';
import '../src/index.css';
import '../src/styles/design-system.css';
const link = { external_player_id:'1202',profile_url:'https://gomafia.pro/stats/1202',status:'verified',updated_at:career.retrievedAt };
globalThis.fetch = async input => {
  const path=String(input);
  const body = path.endsWith('/career') ? {status:'verified',snapshot:career,tournaments:career.career.tournaments,yearly_stats:career.career.yearlyStats,limitations:career.career.limitations,history_status:'available',syncing:false} : {link};
  return new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
};
ReactDOM.createRoot(document.getElementById('root')!).render(<main className="mx-auto max-w-lg bg-neutral-950 p-3 text-white"><PlayerGoMafiaLink playerId="source-fixture" isSelf /></main>);
