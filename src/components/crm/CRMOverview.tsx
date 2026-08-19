import type { CrmOverview } from '../../lib/api.ts';
import type { EveningSection } from './EveningWorkspace.tsx';
import EveningOrganizerTasksPanel from './EveningOrganizerTasksPanel.tsx';
import OrganizerCommandCenter from './OrganizerCommandCenter.tsx';
import './crmOverviewCanonical.css';

interface CRMOverviewProps {
  overview: CrmOverview | null;
  onOpenEvening: (id: string) => void;
  onOpenEveningAdd?: (id: string) => void;
  onOpenPlayer: (id: string) => void;
  onNavigateTab: (tab: string) => void;
  onCreateEvening: () => void;
  onCompleteTask?: (taskId: string) => void | Promise<void>;
  onRefresh?: () => void | Promise<void>;
}

const navigateEveningSection = (eveningId: string, section: EveningSection) => {
  const base = `/admin/evenings/${encodeURIComponent(eveningId)}`;
  const path = section === 'overview' ? base : `${base}/${section}`;
  if (typeof window === 'undefined') return;
  if (window.location.pathname !== path) window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

export const CRMOverview = ({
  overview,
  onOpenEvening,
  onOpenPlayer,
  onNavigateTab,
  onCreateEvening,
  onCompleteTask,
  onRefresh,
}: CRMOverviewProps) => (
  <div className="crm-overview-canonical space-y-4">
    <OrganizerCommandCenter
      overview={overview}
      onOpenEvening={onOpenEvening}
      onOpenEveningSection={navigateEveningSection}
      onOpenPlayer={onOpenPlayer}
      onNavigateTab={(tab) => onNavigateTab(tab)}
      onCreateEvening={onCreateEvening}
      onCompleteTask={onCompleteTask}
      onRefresh={onRefresh}
    />
    <EveningOrganizerTasksPanel onChanged={onRefresh} />
  </div>
);

export default CRMOverview;
