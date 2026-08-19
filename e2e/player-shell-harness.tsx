import { useState } from 'react';
import ReactDOM from 'react-dom/client';
import PlayerBottomNavigation from '../src/components/player/PlayerBottomNavigation.tsx';
import PlayerQuickAccessBar from '../src/components/player/PlayerQuickAccessBar.tsx';
import type { PlayerCabinetSection } from '../src/components/player/playerCabinetNavigation.ts';
import type { PlayerMeResponse } from '../src/types/player.ts';
import '../src/index.css';
import '../src/styles/design-system.css';
import '../src/releasePolish.css';

const player = {
  id: 'p1',
  nickname: 'Чагин',
  tokens: 128,
  avatar_url: null,
} as unknown as PlayerMeResponse['player'];

function Harness() {
  const [section, setSection] = useState<PlayerCabinetSection>('home');

  return (
    <div className="min-h-[var(--tg-viewport-stable-height,100dvh)] bg-background text-foreground">
      <PlayerQuickAccessBar
        player={player}
        tokenBalance={128}
        active={section === 'wallet' ? 'wallet' : section === 'profile' ? 'profile' : null}
        onOpenWallet={() => setSection('wallet')}
        onOpenProfile={() => setSection('profile')}
      />

      <main
        data-testid="player-shell-content"
        className="min-h-[var(--tg-viewport-stable-height,100dvh)] bg-background px-4 pb-24 pt-20"
      >
        <div className="mx-auto w-full max-w-[430px]">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Stage 4 shell</div>
          <h1 className="mt-2 text-2xl font-bold">Общий каркас</h1>
          <p className="mt-2 text-sm text-muted-foreground">Текущий раздел: {section}</p>
          <div className="mt-5 h-72 rounded-[var(--ds-radius-xl)] border border-border bg-card shadow-[var(--ds-shadow-surface)]" />
        </div>
      </main>

      <PlayerBottomNavigation section={section} onOpen={setSection} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Harness />);
