import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import JudgeGameMusicController from "./components/JudgeGameMusicController.tsx";
import { EveningDeathProtocolBridge } from "./components/crm/EveningDeathProtocolOverlay.tsx";
import "./index.css";
import "./components/crm/eveningLiveMobilePolish.css";
import "./components/crm/eveningLiveResponsiveSafe.css";
import "./components/crm/eveningLiveResponsiveRefine.css";
import "./components/crm/eveningLiveTableDecisionFix.css";
import "./components/crm/eveningLivePlayerStatePolish.css";
import "./components/crm/liveGameVisualV2.css";
import "./components/crm/liveGameRoleGlyphsV2.css";
import "./components/crm/liveGameControlsPolishV3.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <JudgeGameMusicController />
    <EveningDeathProtocolBridge />
  </React.StrictMode>
);
