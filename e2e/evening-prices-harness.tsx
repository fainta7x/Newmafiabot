import ReactDOM from 'react-dom/client';
import DataSettingsCRM from '../src/components/crm/DataSettingsCRM.tsx';
import Before from './fixtures/EveningPricesBefore.tsx';
import '../src/index.css';
import '../src/styles/design-system.css';
import '../src/releasePolish.css';
const Component = new URLSearchParams(location.search).has('before') ? Before : DataSettingsCRM;
ReactDOM.createRoot(document.getElementById('root')!).render(<div className="crm-premium min-h-screen bg-[#090a0d] p-3 pb-24 font-sans text-white"><Component /></div>);
