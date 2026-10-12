import ReactDOM from 'react-dom/client';
import { NominationPlaque, PlaceMedal, type NominationGlyph } from '../src/components/player/TrophyIcons.tsx';
import '../src/index.css';
import '../src/styles/design-system.css';
import '../src/releasePolish.css';
import '../src/components/player/TrophyCabinet.css';

const glyphs: NominationGlyph[] = ['sheriff', 'don', 'mafia', 'citizen', 'mvp', 'move', 'star'];
ReactDOM.createRoot(document.getElementById('root')!).render(
  <main className="min-h-screen bg-[#090a0d] p-4 text-white">
    <h2 className="mb-2 text-sm text-white/60">Медали</h2>
    <div data-testid="icon-medals" className="grid grid-cols-4 gap-3">{([1, 2, 3, null] as const).map((tier) => <div key={String(tier)} className="grid h-28 place-items-center rounded-2xl bg-white/[.04]"><PlaceMedal tier={tier} /></div>)}</div>
    <h2 className="mb-2 mt-5 text-sm text-white/60">Номинации</h2>
    <div data-testid="icon-plaques" className="grid grid-cols-4 gap-3">{glyphs.map((glyph) => <div key={glyph} className="grid h-28 place-items-center rounded-2xl bg-white/[.04]"><NominationPlaque glyph={glyph} /></div>)}</div>
  </main>,
);
