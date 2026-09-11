import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import JudgeGameMusicController from "./components/JudgeGameMusicController.tsx";
import ScopedEveningDeathProtocolBridge from "./components/crm/ScopedEveningDeathProtocolBridge.tsx";
import LiveGameResumeBridge from "./components/crm/LiveGameResumeBridge.tsx";
import AppErrorBoundary from "./components/ui/AppErrorBoundary.tsx";
import { initializeCrmPrimaryTitleOwnership } from "./lib/crmPrimaryTitleOwnership.ts";
import { initializeTelegramWebAppViewport } from "./lib/telegramWebAppViewport.ts";
import "./index.css";
import "./styles/design-system.css";
import "./styles/telegram-viewport.css";
import "./releasePolish.css";
import "./components/crm/liveGameJudge.css";
import "./components/crm/liveGameCabinetShell.css";
import "./components/crm/liveGameSeatCabinet.css";
import "./components/crm/liveGameActionPriority.css";
import "./components/crm/liveGameNightReadability.css";
import "./components/crm/liveGameRecoveryPolish.css";
import "./components/crm/liveGameDeathProtocolCabinet.css";
import "./components/crm/liveGameTelegram.css";
import "./components/crm/liveGameUrgentResume.css";
import "./components/public/liveBroadcastCompact.css";

initializeTelegramWebAppViewport();
initializeCrmPrimaryTitleOwnership();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
      <JudgeGameMusicController />
      <ScopedEveningDeathProtocolBridge />
      <LiveGameResumeBridge />
    </AppErrorBoundary>
  </React.StrictMode>
);
