import ReactDOM from 'react-dom/client';
import OrganizerCRM from '../src/components/OrganizerCRM.tsx';
import '../src/index.css';
import '../src/styles/design-system.css';
import '../src/releasePolish.css';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async () => json({ error: 'Organizer authentication required' }, 401);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <OrganizerCRM pathname="/admin" onNavigate={() => undefined} />,
);
