import { useState } from 'react';
import ReactDOM from 'react-dom/client';
import PlayerBottomNavigation from '../src/components/player/PlayerBottomNavigation.tsx';
import PlayerQuickAccessBar from '../src/components/player/PlayerQuickAccessBar.tsx';
import { Button } from '../src/components/ui/Button.tsx';
import { Card, CardContent, CardHeader } from '../src/components/ui/Card.tsx';
import { SegmentedControl } from '../src/components/ui/SegmentedControl.tsx';
import type { PlayerCabinetSection } from '../src/components/player/playerCabinetNavigation.ts';
import type { PlayerMeResponse } from '../src/types/player.ts';
import '../src/index.css';
import '../src/styles/design-system.css';
import '../src/releasePolish.css';

const player = {
  id: 'p1',
  nickname: 'Чагин',
  tokens: 100,
  avatar_url: null,
  elo: 1000,
} as unknown as PlayerMeResponse['player'];

type SampleTab = 'history' | 'stats' | 'career' | 'recaps';
type HistoryScope = 'mine' | 'all';

const SAMPLE_TABS: Array<{ value: SampleTab; label: string }> = [
  { value: 'history', label: 'История' },
  { value: 'stats', label: 'Статистика' },
  { value: 'career', label: 'Карьера' },
  { value: 'recaps', label: 'Итоги' },
];

function HomeSample() {
  return (
    <div className="mx-auto w-full max-w-[430px] space-y-3">
      <header className="px-1 pb-1 pt-1">
        <h1 className="text-2xl font-semibold">Главная</h1>
        <p className="mt-1 text-xs leading-5 text-white/40">Привет, Чагин</p>
      </header>

      <Card data-testid="canonical-card" className="rounded-[28px]">
        <CardHeader className="pb-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Следующий вечер</div>
        </CardHeader>
        <CardContent className="pt-3">
          <div className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/40">
            Ближайших игровых вечеров пока нет.
          </div>
        </CardContent>
      </Card>

      <Card
        data-testid="canonical-summary-card"
        className="rounded-[28px]"
        style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.08), rgba(255,255,255,0.035))' }}
      >
        <CardHeader className="pb-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Твоя игра</div>
        </CardHeader>
        <CardContent className="pt-3">
          <div className="grid grid-cols-4 gap-2">
            <div className="rounded-2xl bg-black/20 p-3"><div className="text-xl font-semibold">1000</div><div className="mt-1 text-[10px] text-white/35">ELO</div></div>
            <div className="rounded-2xl bg-black/20 p-3"><div className="text-xl font-semibold">#29</div><div className="mt-1 text-[10px] text-white/35">место</div></div>
            <div className="rounded-2xl bg-black/20 p-3"><div className="text-xl font-semibold">0</div><div className="mt-1 text-[10px] text-white/35">игр</div></div>
            <div className="rounded-2xl bg-black/20 p-3"><div className="text-xl font-semibold">0%</div><div className="mt-1 text-[10px] text-white/35">побед</div></div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="secondary">Рейтинг</Button>
            <Button variant="secondary">Мои игры</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function GamesSample() {
  const [sampleTab, setSampleTab] = useState<SampleTab>('history');
  const [historyScope, setHistoryScope] = useState<HistoryScope>('mine');

  return (
    <div className="mx-auto w-full max-w-[430px] space-y-3">
      <header className="px-1 pb-3 pt-1">
        <h1 className="text-2xl font-semibold">Игры</h1>
        <p className="mt-1 text-xs leading-5 text-white/40">История партий, показатели, карьера и итоги вечеров</p>
      </header>

      <SegmentedControl
        ariaLabel="Разделы игр"
        value={sampleTab}
        items={SAMPLE_TABS}
        onValueChange={setSampleTab}
      />

      <div
        aria-label="Фильтр истории"
        className="grid grid-cols-2 gap-1 rounded-2xl bg-white/[0.045] p-1"
      >
        {([
          { value: 'mine' as const, label: 'Мои игры' },
          { value: 'all' as const, label: 'Все игры' },
        ]).map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setHistoryScope(item.value)}
            aria-current={historyScope === item.value ? 'page' : undefined}
            className={`min-h-10 rounded-xl px-3 text-sm font-medium transition ${
              historyScope === item.value ? 'bg-white text-black' : 'text-white/50'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <Card data-testid="canonical-history-card">
        <CardHeader className="pb-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Моя история</div>
        </CardHeader>
        <CardContent className="pt-3">
          <div className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">
            Сохранённых игр пока нет.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Harness() {
  const [section, setSection] = useState<PlayerCabinetSection>('home');
  const gamesVisible = section === 'games' || section === 'stats' || section === 'career' || section === 'recaps';

  return (
    <div className="min-h-[var(--tg-viewport-stable-height,100dvh)] bg-[#090a0d] font-sans text-white antialiased">
      <PlayerQuickAccessBar
        player={player}
        tokenBalance={100}
        active={section === 'wallet' ? 'wallet' : section === 'profile' ? 'profile' : null}
        onOpenWallet={() => setSection('wallet')}
        onOpenProfile={() => setSection('profile')}
      />

      <main
        data-testid="player-shell-content"
        className="min-h-[var(--tg-viewport-stable-height,100dvh)] bg-[#090a0d] px-3 pb-24 pt-20"
      >
        {gamesVisible ? <GamesSample /> : <HomeSample />}
        <p className="sr-only">Текущий раздел: {section}</p>
      </main>

      <PlayerBottomNavigation section={section} onOpen={setSection} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Harness />);