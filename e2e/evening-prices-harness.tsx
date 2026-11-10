import { ClubOwnerContext } from '../src/components/crm/useClubOwner.ts';
import ReactDOM from 'react-dom/client';
import { EveningPriceSettingsCard } from '../src/components/crm/EveningPriceSettingsCard.tsx';
import Before from './fixtures/EveningPricesBefore.tsx';
import './appStyles.ts';
// «Стоимость вечеров» is its own screen now (owner, 2026-11-10); the «before» fixture still shows the old data screen.
const After = () => <div className="mx-auto w-full max-w-2xl"><EveningPriceSettingsCard /></div>;
const Component = new URLSearchParams(location.search).has('before') ? Before : After;
ReactDOM.createRoot(document.getElementById('root')!).render(<div className="crm-premium min-h-screen bg-[#090a0d] p-3 pb-24 font-sans text-white"><ClubOwnerContext.Provider value={new URLSearchParams(location.search).get('owner') === '1'}><Component /></ClubOwnerContext.Provider></div>);
