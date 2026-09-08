import ReactDOM from 'react-dom/client';
import { DisciplineConfirmationOverlay } from '../src/components/LiveGameEngine/LiveGameOverlays.tsx';
import '../src/index.css';
import '../src/styles/design-system.css';
import '../src/releasePolish.css';

const player = {
  slot_num: 6,
  player_id: 'preview-player',
  nickname: 'Чагин',
  role: 'sheriff',
  alive: true,
  fouls: 3,
} as any;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <div data-testid="live-game-engine" className="min-h-screen bg-[#090a0d] text-white">
    <div className="p-4 text-sm text-white/50">Live Game · production confirmation overlay</div>
    <DisciplineConfirmationOverlay
      pending={{ slot: 6, action: 'direct_removal' }}
      player={player}
      onCancel={() => undefined}
      onConfirm={() => undefined}
    />
  </div>,
);
