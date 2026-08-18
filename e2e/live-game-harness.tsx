import ReactDOM from 'react-dom/client';
import JudgeGameMusicController from '../src/components/JudgeGameMusicController.tsx';
import { EveningDeathProtocolBridge } from '../src/components/crm/EveningDeathProtocolOverlay.tsx';
import { EveningLiveDisciplineGlyphBridge } from '../src/components/crm/EveningLiveDisciplineGlyphBridge.tsx';
import JudgeTestGameModal from '../src/components/player/JudgeTestGameModal.tsx';
import AppErrorBoundary from '../src/components/ui/AppErrorBoundary.tsx';
import '../src/index.css';
import '../src/releasePolish.css';
import '../src/components/crm/eveningLiveMobilePolish.css';
import '../src/components/crm/eveningLiveResponsiveSafe.css';
import '../src/components/crm/eveningLiveResponsiveRefine.css';
import '../src/components/crm/eveningLiveTableDecisionFix.css';
import '../src/components/crm/eveningLivePlayerStatePolish.css';
import '../src/components/crm/liveGameVisualV2.css';
import '../src/components/crm/liveGameRoleGlyphsV2.css';
import '../src/components/crm/liveGameControlsPolishV3.css';
import '../src/components/crm/liveGameDisciplineGlyphsV4.css';
import '../src/components/crm/liveGameActionGroupsV5.css';
import '../src/components/crm/liveGameMobileGeometryV6.css';

function Harness() {
  return (
    <AppErrorBoundary>
      <JudgeTestGameModal
        judge={{ id: 'e2e-judge', nickname: 'E2E Judge' }}
        onClose={() => undefined}
      />
      <JudgeGameMusicController />
      <EveningDeathProtocolBridge />
      <EveningLiveDisciplineGlyphBridge />
    </AppErrorBoundary>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Harness />);
