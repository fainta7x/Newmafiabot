import { PublicGuide, guideTabFromSearch } from './PublicGuide.tsx';

// The /guide route as one lazily loaded screen: the guide, its trainings and courses stay out of the start bundle.
export default function PublicGuideRoute({ onNavigate }: { onNavigate?: (path: string, replace?: boolean) => void }) {
  return <PublicGuide initialTab={guideTabFromSearch(window.location.search)} onNavigate={onNavigate} />;
}
