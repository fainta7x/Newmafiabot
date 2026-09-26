import ReactDOM from 'react-dom/client';
import { PublicGuide, guideTabFromSearch } from '../src/components/public/PublicGuide.tsx';
import '../src/index.css';

// Opens the split-vote trainer by default; ?tab=home (or any guide section) opens that screen.
const initialTab = new URLSearchParams(window.location.search).has('tab') ? guideTabFromSearch(window.location.search) : 'split';
ReactDOM.createRoot(document.getElementById('root')!).render(<PublicGuide initialTab={initialTab} />);
