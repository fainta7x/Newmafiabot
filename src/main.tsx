import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { EveningDeathProtocolBridge } from "./components/crm/EveningDeathProtocolOverlay.tsx";
import "./index.css";
import "./components/crm/eveningLiveMobilePolish.css";
import "./components/crm/eveningLiveResponsiveSafe.css";
import "./components/crm/eveningLiveResponsiveRefine.css";
import "./components/crm/eveningLiveTableDecisionFix.css";
import "./components/crm/eveningLivePlayerStatePolish.css";

const telegramWebApp = (window as any).Telegram?.WebApp;
if (telegramWebApp) {
  try {
    telegramWebApp.ready?.();
    telegramWebApp.expand?.();
  } catch {}

  const initData = telegramWebApp.initData;
  if (typeof initData === 'string' && initData.length > 0) {
    void fetch('/api/auth/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ initData }),
    }).catch(() => {});
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <EveningDeathProtocolBridge />
  </React.StrictMode>
);
