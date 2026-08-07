import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { EveningDeathProtocolBridge } from "./components/crm/EveningDeathProtocolOverlay.tsx";
import "./index.css";
import "./components/crm/eveningLiveMobilePolish.css";
import "./components/crm/eveningLiveResponsiveSafe.css";
import "./components/crm/eveningLiveResponsiveRefine.css";
import "./components/crm/eveningLiveTableDecisionFix.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <EveningDeathProtocolBridge />
  </React.StrictMode>
);
