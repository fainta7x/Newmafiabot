import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import JudgeGameMusicController from "./components/JudgeGameMusicController.tsx";
import { EveningDeathProtocolBridge } from "./components/crm/EveningDeathProtocolOverlay.tsx";
import { EveningLiveDisciplineGlyphBridge } from "./components/crm/EveningLiveDisciplineGlyphBridge.tsx";
import AppErrorBoundary from "./components/ui/AppErrorBoundary.tsx";
import "./index.css";
import "./releasePolish.css";
import "./components/crm/eveningLiveMobilePolish.css";
import "./components/crm/eveningLiveResponsiveSafe.css";
import "./components/crm/eveningLiveResponsiveRefine.css";
import "./components/crm/eveningLiveTableDecisionFix.css";
import "./components/crm/eveningLivePlayerStatePolish.css";
import "./components/crm/liveGameVisualV2.css";
import "./components/crm/liveGameRoleGlyphsV2.css";
import "./components/crm/liveGameControlsPolishV3.css";
import "./components/crm/liveGameDisciplineGlyphsV4.css";
import "./components/crm/liveGameActionGroupsV5.css";
import "./components/crm/liveGameMobileGeometryV6.css";
import "./components/crm/liveGameJudgeConsoleV7.css";

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
