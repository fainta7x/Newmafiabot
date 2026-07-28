import { useState, useEffect } from "react";
import OrganizerCRM from "./components/OrganizerCRM.tsx";
import { PublicJoinView } from "./components/public/PublicJoinView.tsx";

export default function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const handlePopState = () => {
      setPathname(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Stage 10 Public Join Route
  if (pathname.startsWith('/join')) {
    const parts = pathname.split('/').filter(Boolean);
    const eveningId = parts[1] || 'latest';
    return <PublicJoinView eveningId={eveningId} />;
  }

  // Primary CRM View
  return <OrganizerCRM />;
}
