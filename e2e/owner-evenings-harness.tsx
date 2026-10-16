import ReactDOM from 'react-dom/client';
import WeekEventsPanel from '../src/components/crm/WeekEventsPanel.tsx';
import BeforeWeek from './fixtures/WeekEventsPanel.before.tsx';
import Answers from '../src/components/crm/EveningGameRegistrationDashboard.tsx';
import BeforeAnswers from './fixtures/EveningGameRegistrationDashboard.before.tsx';
import { api } from '../src/lib/api.ts';
import '../src/index.css';
import '../src/styles/design-system.css';
import '../src/releasePolish.css';

// Same isolated fixture and component props for before/after. No network or real response writes.
const now = Date.parse('2026-10-16T12:00:00Z');
const evenings = [
  { id: 'rating', title: 'Рейтинговый вечер', format: 'RATING', starts_at: '2026-10-17T15:00:00Z', registered_count: 6, guests_count: 0, thinking_count: 2 },
  { id: 'novice', title: 'Вечер для новичков', format: 'NOVICE', starts_at: '2026-10-18T16:00:00Z', registered_count: 8, guests_count: 3, late_count: 1, thinking_count: 2 },
  { id: 'club', title: 'Пятничный клубный вечер', format: 'CASUAL', starts_at: '2026-10-19T18:00:00Z', registered_count: 11, guests_count: 2, thinking_count: 1 },
].map((evening) => ({ ...evening, status: 'published', venue: 'Суп с Котом' })) as any[];
const people = [
  { id: 'p1', nickname: 'Богдан', response_status: 'unanswered', delivery_status: 'sent', first_sent_at: '2026-10-12T16:00:00Z' },
  { id: 'p2', nickname: 'Матроскина', response_status: 'thinking', delivery_status: 'sent', first_sent_at: '2026-10-12T16:00:00Z' },
  { id: 'p3', nickname: 'Пристань', response_status: 'going', delivery_status: 'sent', first_sent_at: '2026-10-12T16:00:00Z' },
].map((person) => ({ ...person, eligible_now: true }));
api.getTournaments = async () => [{ id: 't1', title: 'Клубный турнир', date: '2026-10-17T14:00:00Z', status: 'draft' }] as any;
api.getEvening = async () => ({ id: 'novice', status: 'published', starts_at: '2026-10-18T16:00:00Z', participants: people.map((person) => ({ ...person, id: `ep-${person.id}`, player_id: person.id, registration_status: person.response_status })) }) as any;
api.updateParticipant = async (id, patch) => {
  const person = people.find((item) => `ep-${item.id}` === id)!;
  Object.assign(person, patch);
  document.body.dataset.savedResponse = String(patch.response_status);
  return { ...person } as any;
};
globalThis.fetch = async (input) => {
  const path = String(input);
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
  if (path.endsWith('/announcement-overview')) return json({ players: people, summary: { audience: 3 } });
  if (path.endsWith('/slots')) return json({ slots: [], event: {} });
  return new Response('{}', { status: 404 });
};
const query = new URLSearchParams(location.search);
const before = query.has('before');
const screen = query.get('screen');
const Week = before ? BeforeWeek : WeekEventsPanel;
const ResponseList = before ? BeforeAnswers : Answers;
ReactDOM.createRoot(document.getElementById('root')!).render(
  <main className="crm-premium mx-auto min-h-screen w-full max-w-[430px] bg-[#090a0d] px-3 py-4 text-white">
    {screen === 'answers' ? <ResponseList eveningId="novice" /> : <Week now={now} evenings={evenings} variant={screen === 'events' ? 'cards' : 'rows'} onOpenEvening={() => {}} onOpenTournament={() => {}} />}
  </main>,
);
