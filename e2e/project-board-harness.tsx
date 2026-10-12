import ReactDOM from 'react-dom/client';
import ProjectBoardCRM from '../src/components/crm/ProjectBoardCRM.tsx';
import { parseProjectState } from '../src/lib/projectBoard.ts';
import projectState from '../docs/PROJECT_STATE.md?raw';
import '../src/index.css';
import '../src/styles/design-system.css';
import '../src/releasePolish.css';

// The real docs/PROJECT_STATE.md parsed in the browser; the pull requests are a fixed sample.
const cards = parseProjectState(projectState);
const pulls = [
  { number: 863, title: 'Вскрытие дона: статистика связок и «две версии стола» на странице игры', url: '#', colour: 'ready', author: 'claude', state: 'open', updated_at: '2026-10-12T10:00:00Z', checks: { passed: 4, total: 4 } },
  { number: 852, title: 'GoMafia: подтверждён Chagin /stats/1202; полный автоимпорт истории требует источника', url: '#', colour: 'working', author: 'gpt', state: 'open', updated_at: '2026-10-12T09:00:00Z', checks: { passed: 2, total: 4 } },
  { number: 861, title: 'Вскрытие и круги: статистика, страница игры, разбор; профиль по сезону; реплей', url: '#', colour: 'merged', author: 'claude', state: 'merged', updated_at: '2026-10-12T08:00:00Z', checks: null },
];
window.fetch = (async (url: string) => String(url).endsWith('/pulls')
  ? new Response(JSON.stringify({ pulls }), { status: 200 })
  : new Response(JSON.stringify({ cards, updated_at: '2026-10-12T10:00:00Z' }), { status: 200 })) as typeof window.fetch;

ReactDOM.createRoot(document.getElementById('root')!).render(<div className="mx-auto w-full max-w-3xl p-4"><ProjectBoardCRM /></div>);
