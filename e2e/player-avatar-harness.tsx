import { createRoot } from 'react-dom/client';
import './appStyles.ts';
import { api } from '../src/lib/api.ts';
import { PlayerAvatar } from '../src/components/ui/PlayerAvatar.tsx';

const fallback = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="1768"><rect width="2048" height="1768" fill="#202124"/><path d="M0 0L2048 1768M2048 0L0 1768" stroke="#f2ddaf" stroke-width="12"/><circle cx="1024" cy="650" r="350" fill="#b7a07c"/><rect x="500" y="1000" width="1048" height="768" fill="#355777"/></svg>')}`;
const photos = (window as unknown as { avatarFixtures?: Record<string, string> }).avatarFixtures || {};
api.getPlayerAvatar = async (id: string) => ({ data_url: photos[id] || fallback, mime_type: 'image/jpeg', width: 2048, height: 1768, byte_size: 500000, updated_at: 'fixture-v1' });

createRoot(document.getElementById('root')!).render(
  <main className="min-h-screen bg-[#202124] p-4 text-white">
    <h1 className="mb-4 text-xl font-semibold">Аватарки игроков</h1>
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {[['nason', 'Насон'], ['dendi', 'Денди']].map(([id, name]) => <div key={id} className="flex items-center gap-3 rounded-xl border border-white/10 p-4"><PlayerAvatar playerId={id} nickname={name} avatarVersion="fixture-v1" size="md" /><span>{name}</span></div>)}
    </section>
    <section className="mt-4 flex flex-wrap items-center gap-4" aria-label="Размеры аватарок">
      {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map(size => <PlayerAvatar key={size} playerId="nason" nickname="Насон" avatarVersion="fixture-v1" size={size} />)}
    </section>
  </main>,
);
