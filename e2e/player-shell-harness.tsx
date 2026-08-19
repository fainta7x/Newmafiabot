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
} as unknown as PlayerMeResponse['player'];

type SampleTab = 'history' | 'stats' | 'career' | 'recaps';

const SAMPLE_TABS: Array<{ value: SampleTab; label: string }> = [
  { value: 'history', label: 'История' },
  { value: 'stats', label: 'Статистика' },
  { value: 'career', label: 'Карьера' },
  { value: 'recaps', label: 'Итоги' },
];

function Harness() {
  const [section, setSection] = useState<PlayerCabinetSection>('home');
  const [sampleTab, setSampleTab] = useState<SampleTab>('history');

  return (
    <div className="min-h-[var(--tg-viewport-stable-height,100dvh)] bg-[#090a0d] text-white">
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
        <div className="mx-auto w-full max-w-[430px] space-y-3">
          <header className="px-1 pb-1 pt-1">
            <h1 className="text-2xl font-semibold">Главная</h1>
            <p className="mt-1 text-xs leading-5 text-white/40">Привет, Чагин</p>
          </header>

          <Card data-testid="canonical-card">
            <CardHeader className="pb-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Следующий вечер</div>
            </CardHeader>
            <CardContent>
              <div className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/40">
                Ближайших игровых вечеров пока нет.
              </div>
            </CardContent>
          </Card>

          <SegmentedControl
            ariaLabel="Пример разделов игр"
            value={sampleTab}
            items={SAMPLE_TABS}
            onValueChange={setSampleTab}
          />

          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary">Рейтинг</Button>
            <Button data-testid="canonical-primary">Выбрать игры</Button>
          </div>

          <p className="sr-only">Текущий раздел: {section}</p>
        </div>
      </main>

      <PlayerBottomNavigation section={section} onOpen={setSection} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Harness />);
