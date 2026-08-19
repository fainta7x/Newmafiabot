import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import JudgeGameMusicController from "./components/JudgeGameMusicController.tsx";
import { EveningDeathProtocolBridge } from "./components/crm/EveningDeathProtocolOverlay.tsx";
import { EveningLiveDisciplineGlyphBridge } from "./components/crm/EveningLiveDisciplineGlyphBridge.tsx";
import AppErrorBoundary from "./components/ui/AppErrorBoundary.tsx";
import "./index.css";
import "./styles/design-system.css";
import "./releasePolish.css";
import "./components/crm/liveGameJudge.css";
import "./components/crm/liveGameCabinetShell.css";
import "./components/crm/liveGameSeatCabinet.css";
import "./components/crm/liveGameActionPriority.css";
import "./components/crm/liveGameTelegram.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
      <JudgeGameMusicController />
      <EveningDeathProtocolBridge />
      <EveningLiveDisciplineGlyphBridge />
    </AppErrorBoundary>
  </React.StrictMode>
);