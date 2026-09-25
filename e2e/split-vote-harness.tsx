import ReactDOM from 'react-dom/client';
import { PublicGuide } from '../src/components/public/PublicGuide.tsx';
import '../src/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<PublicGuide initialTab="split" />);
