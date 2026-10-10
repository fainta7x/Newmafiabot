import { useEffect, useState, type ReactNode } from 'react';
import { countGames, countWins } from '../../lib/russianPlural';
import { openCanonicalPlayerProfile } from './playerProfileNavigation.ts';

type Person = { player_id: string; nickname: string; avatar_url: string };
type Teammate = Person & { games: number; wins: number; win_rate: number };
type RolePartner = Teammate & { partner_role: string | null };
type Stage = 'acquaintance' | 'teammates' | 'tandem';
type StageProgress = Person & { stage: Stage; shared_games: number; same_team_games: number; games_to_next: number | null };
type Teamwork = {
  my_team: { red: Teammate[]; black: Teammate[] };
  role_pairs: Array<{ my_role: 'don' | 'mafia' | 'sheriff'; games: number; partners: RolePartner[] }>;
  opponents: { hard: Teammate[]; easy: Teammate[] };
  stages: { counts: Record<Stage, number>; closest: StageProgress[] };
  never_played: Array<Person & { recent_games: number }>;
};

const ROLE_LABEL: Record<string, string> = { don: 'дон', mafia: 'мафия', sheriff: 'шериф', citizen: 'мирный' };
const NEXT_STEP: Record<Stage, string> = { acquaintance: 'напарники', teammates: 'связка', tandem: '' };

function Avatar({ person }: { person: Person }) {
  return person.avatar_url
    ? <img src={person.avatar_url} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} className="h-9 w-9 shrink-0 rounded-xl object-cover" />
    : <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-xs font-semibold text-white/45">{person.nickname.slice(0, 1).toUpperCase()}</div>;
}

function Row({ person, line, tone = 'bg-black/20' }: { person: Person; line: ReactNode; tone?: string }) {
  return (
    <button type="button" onClick={() => openCanonicalPlayerProfile(person.player_id)} className={`flex min-h-12 w-full items-center gap-3 rounded-2xl p-2.5 text-left active:bg-white/[0.05] ${tone}`}>
      <Avatar person={person} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{person.nickname}</div>
        <div className="mt-0.5 text-[11px] leading-4 text-white/45">{line}</div>
      </div>
    </button>
  );
}

function Card({ testId, eyebrow, title, hint, children }: { testId: string; eyebrow: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <section data-testid={testId} className="rounded-[26px] border border-white/10 bg-white/[0.04] p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">{eyebrow}</div>
      <h2 className="mt-1 text-base font-semibold">{title}</h2>
      {hint ? <p className="mt-1 text-xs leading-5 text-white/40">{hint}</p> : null}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

const wins = (item: Teammate) => `${countGames(item.games)} · ${countWins(item.wins)}`;

/** «Моя команда»: the personal team-building view of the profile → Связи tab (owner request 2026-10-10). */
export default function PersonalTeamwork() {
  const [data, setData] = useState<Teamwork | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/player/team-connections', { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => { if (!cancelled && body?.my_team) setData(body as Teamwork); })
      .catch(() => { /* the rest of the tab stays usable */ });
    return () => { cancelled = true; };
  }, []);

  if (!data) return null;
  const hasTeam = data.my_team.red.length > 0 || data.my_team.black.length > 0;
  const { counts, closest } = data.stages;
  const known = counts.acquaintance + counts.teammates + counts.tandem;

  return (
    <div data-testid="personal-teamwork" className="space-y-3">
      <Card testId="my-team" eyebrow="Команда" title="Моя команда" hint="Кто чаще всего в одной команде.">
        {hasTeam ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {([['red', '🔴 За красных'], ['black', '⚫ За чёрных']] as const).map(([team, label]) => (
              <div key={team}>
                <h3 className="mb-2 text-xs font-semibold text-white/65">{label}</h3>
                <div className="space-y-2">
                  {data.my_team[team].map((item) => <Row key={item.player_id} person={item} line={wins(item)} />)}
                  {!data.my_team[team].length ? <p className="text-xs text-white/40">Пока ни с кем.</p> : null}
                </div>
              </div>
            ))}
          </div>
        ) : <p className="rounded-2xl bg-black/20 px-3 py-5 text-center text-xs text-white/35">После нескольких игр здесь появится команда.</p>}
      </Card>

      {data.role_pairs.length ? (
        <Card testId="role-pairs" eyebrow="Роли" title="Мои пары по ролям" hint="Кто чаще всего рядом в этой роли.">
          {data.role_pairs.map((entry) => (
            <div key={entry.my_role}>
              <h3 className="mb-2 text-xs font-semibold text-white/65">Роль: {ROLE_LABEL[entry.my_role]} · {countGames(entry.games)}</h3>
              <div className="space-y-2">
                {entry.partners.map((item) => (
                  <Row key={item.player_id} person={item} line={<>{item.partner_role ? `Чаще всего ${ROLE_LABEL[item.partner_role] || 'в команде'} · ` : ''}{wins(item)}</>} />
                ))}
              </div>
            </div>
          ))}
        </Card>
      ) : null}

      {data.opponents.hard.length || data.opponents.easy.length ? (
        <Card testId="my-opponents" eyebrow="Соперники" title="С кем играть против" hint="Здесь те, с кем игра друг против друга была хотя бы три раза.">
          <div className="grid gap-3 sm:grid-cols-2">
            {([['hard', 'Сложные соперники', 'border border-rose-200/[0.07] bg-rose-300/[0.035]'], ['easy', 'Удобные соперники', 'border border-emerald-200/[0.07] bg-emerald-300/[0.035]']] as const).map(([key, label, tone]) => (
              <div key={key}>
                <h3 className="mb-2 text-xs font-semibold text-white/65">{label}</h3>
                <div className="space-y-2">
                  {data.opponents[key].map((item) => (
                    <Row key={item.player_id} person={item} tone={tone} line={`Против друг друга ${countGames(item.games)} · побед: ${item.wins} из ${item.games}`} />
                  ))}
                  {!data.opponents[key].length ? <p className="text-xs text-white/40">Пока нет.</p> : null}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {known > 0 ? (
        <Card testId="known-steps" eyebrow="Знакомства" title="Ступени знакомства" hint="Напарники — от трёх игр в одной команде, связка — от шести.">
          <div className="grid grid-cols-3 gap-1.5 text-center">
            {([['acquaintance', 'Знакомые'], ['teammates', 'Напарники'], ['tandem', 'Связки']] as const).map(([key, label]) => (
              <div key={key} className="rounded-xl bg-black/20 p-2">
                <div className="text-lg font-semibold">{counts[key]}</div>
                <div className="text-[11px] text-white/40">{label}</div>
              </div>
            ))}
          </div>
          {closest.length ? (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-white/65">Ближе всего к следующей ступени</h3>
              {closest.map((item) => (
                <Row key={item.player_id} person={item} line={`Ещё ${countGames(item.games_to_next || 0)} в одной команде до ступени «${NEXT_STEP[item.stage]}»`} />
              ))}
            </div>
          ) : null}
        </Card>
      ) : null}

      {data.never_played.length ? (
        <Card testId="never-played" eyebrow="Новые встречи" title="Ещё не играли вместе" hint="Недавно играли в клубе, но за одним столом пока не сидели. Позвать на вечер можно из профиля.">
          {data.never_played.map((item) => (
            <Row key={item.player_id} person={item} line={`За последние три месяца: ${countGames(item.recent_games)}`} />
          ))}
        </Card>
      ) : null}
    </div>
  );
}
