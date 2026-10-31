// The app's stylesheets in the app's order (src/main.tsx). Every browser harness imports this file so its pages look
// like the app; screenshots and layout audits of a harness with other styles are not evidence (AGENTS.md, Layout and
// text gate). Guarded by src/tests/harnessStyles.test.ts.
import '../src/index.css';
import '../src/styles/design-system.css';
import '../src/styles/telegram-viewport.css';
import '../src/releasePolish.css';
import '../src/components/crm/liveGameJudge.css';
import '../src/components/crm/liveGameDesktopParity.css';
import '../src/components/crm/liveGameCabinetShell.css';
import '../src/components/crm/liveGameSeatCabinet.css';
import '../src/components/crm/liveGameActionPriority.css';
import '../src/components/crm/liveGameNightReadability.css';
import '../src/components/crm/liveGameRecoveryPolish.css';
import '../src/components/crm/liveGameDeathProtocolCabinet.css';
import '../src/components/crm/liveGameTelegram.css';
import '../src/components/crm/liveGameMobileCenterPriority.css';
import '../src/components/crm/liveGameSeatDisciplineClearance.css';
import '../src/components/public/liveBroadcastCompact.css';
