import ReactDOM from 'react-dom/client';
import VerifiedPlayerOnboarding from '../src/components/player/VerifiedPlayerOnboarding.tsx';
import './appStyles.ts';

// The player login screen; `?mode=waiting` — a VK login started here waits for the confirmation (2026-11-20).
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const waiting = new URLSearchParams(location.search).get('mode') === 'waiting';
try {
  if (waiting) localStorage.setItem('vk-login-pending:v1', JSON.stringify({ state: 'preview-state', at: Date.now() }));
  else localStorage.removeItem('vk-login-pending:v1');
} catch { /* preview only */ }
globalThis.fetch = async (input) => {
  const path = String(input);
  if (path.includes('/api/integrations/player/vk/handoff')) return json({ status: 'pending' });
  if (path.includes('/api/auth/onboarding')) return json({ error: 'not found' }, 404);
  return json({}, 404);
};

ReactDOM.createRoot(document.getElementById('root')!).render(<VerifiedPlayerOnboarding />);
