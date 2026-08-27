import ReactDOM from 'react-dom/client';
import { Calendar, Menu, RefreshCw, Users } from 'lucide-react';
import MoreCRM from '../src/components/crm/MoreCRM.tsx';
import '../src/index.css';
import '../src/styles/design-system.css';
import '../src/releasePolish.css';

const nav = [
  { id: 'overview', label: 'Сегодня', icon: RefreshCw },
  { id: 'evenings', label: 'События', icon: Calendar },
  { id: 'players', label: 'Игроки', icon: Users },
  { id: 'more', label: 'Ещё', icon: Menu },
];

function Harness() {
  return (
    <div className="relative mx-auto min-h-screen w-full max-w-[430px] overflow-x-hidden bg-[#090a0d] font-sans text-white">
      <main className="px-3 pb-28 pt-3">
        <MoreCRM
          onOpenTasks={() => undefined}
          onOpenAnalytics={() => undefined}
          onOpenTheme={() => undefined}
          onOpenGameEngine={() => undefined}
          onOpenPlayerMusic={() => undefined}
          onLogout={() => undefined}
        />
      </main>

      <nav className="organizer-bottom-nav glass-nav fixed bottom-0 left-0 right-0 z-40 grid min-h-[64px] h-[calc(64px+env(safe-area-inset-bottom))] grid-cols-4 border-t border-border-soft pb-safe sm:hidden">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = item.id === 'more';
          return (
            <button key={item.id} data-testid={`crm-nav-${item.id}`} type="button" className="relative flex min-h-[48px] min-w-0 flex-col items-center justify-center px-1">
              <Icon className={`h-[21px] w-[21px] ${active ? 'text-accent' : 'text-text-muted'}`} />
              <span className={`mt-1 max-w-full truncate text-[11px] leading-none ${active ? 'font-bold text-text-primary' : 'font-medium text-text-muted'}`}>{item.label}</span>
              {active ? <span className="absolute top-1 h-0.5 w-5 rounded-full bg-accent" /> : null}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Harness />);
