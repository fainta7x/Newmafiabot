import React, { useEffect, useMemo, useState } from 'react';
import PlayerProgressionPanel from './PlayerProgressionPanel.tsx';
import PlayerStoriesPanel from './PlayerStoriesPanel.tsx';

type FormGame = {
  id: string;
  title?: string | null;
  date?: string | null;
  status?: string | null;
  won?: boolean | null;
  role?: string | null;
  game_number?: number | null;
};

type ClubHighlight = {
  player_id: string;
  nickname: string;
  avatar_url: string;
  type: 'win_streak' | 'hot_form' | string;
  text: string;
};

type PowerEntry = {
  place: number;
  player_id: string;
  nickname: string;
  avatar_url: string;
  games: number;
  wins: number;
  win_rate: number;
  streak: number;
  score: number;
  movement: number | null;
};

type ClubFormData = {
  viewer_id: string;
  highlights: ClubHighlight[];
  power_ranking: PowerEntry[];
  players_with_form: number;
  meta?: { formula?: string };
};

type PersonRelationship = {
  player_id: string;
  nickname: string;
  games: number;
  wins: number;
  win_rate: number;
  avatar_url: string;
};

type ClubDuo = {
  a_id: string;
  a_name: string;
  b_id: string;
  b_name: string;
  team: 'red' | 'black';
  games: number;
  wins: number;
  win_rate: number;
  a_avatar_url: string;
  b_avatar_url: string;
};

type RelationshipData = {
  rivals: PersonRelationship[];
  teammates: PersonRelationship[];
  club_duos: { red: ClubDuo[]; black: ClubDuo[] };
};

type Section = 'mine' | 'club' | 'relations' | 'stories';
const ROLES = ['citizen', 'sheriff', 'mafia', 'don'] as const;
type CanonicalRole = typeof ROLES[number];

const roleLabel = (role: string | null | undefined) => {
  if (role === 'citizen') return 'Мирный';
  if (role === 'sheriff') return 'Шериф';
  if (role === 'mafia') return 'Мафия';
  if (role === 'don') return 'Дон';
  return role || 'Роль не указана';
};

const roleIcon = (role: CanonicalRole) => role === 'citizen' ? '🔴' : role === 'sheriff' ? '⭐' : role === 'mafia' ? '⚫' : '🎩';

const shortDate = (value: string | null | undefined) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(date);
};

const movementLabel = (value: number | null) => {
  if (value == null) return 'NEW';
  if (value > 0) return `▲${value}`;
  if (value < 0) return `▼${Math.abs(value)}`;
  return '—';
};

const Avatar = ({ src, size = 'md' }: { src: string; size?: 'sm' | 'md' }) => (
  <img
    src={src}
    alt=""
    onError={(event) => { event.currentTarget.style.display = 'none'; }}
    className={`${size === 'sm' ? 'h-8 w-8' : 'h-10 w-10'} shrink-0 rounded-xl object-cover`}
  />
);

export default function PlayerClubSection({ games }: { games: FormGame[] }) {
  const [section, setSection] = useState<Section>('mine');
  const [clubForm, setClubForm] = useState<ClubFormData | null>(null);
  const [clubFormLoading, setClubFormLoading] = useState(false);
  const [clubFormError, setClubFormError] = useState<string | null>(null);
  const [relationships, setRelationships] = useState<RelationshipData | null>(null);
  const [relationshipsLoading, setRelationshipsLoading] = useState(false);
  const [relationshipsError, setRelationshipsError] = useState<string | null>(null);

  const form = useMemo(() => games
    .filter((game) => game.status === 'completed' && typeof game.won === 'boolean')
    .slice(0, 10), [games]);

  const roleCareer = useMemo(() => ROLES.map((role) => {
    const roleGames = games.filter((game) => game.status === 'completed' && game.role === role && typeof game.won === 'boolean');
    const wins = roleGames.filter((game) => game.won).length;
    let streak = 0;
    for (const game of roleGames) {
      if (!game.won) break;
      streak += 1;
    }
    return {
      role,
      games: roleGames.length,
      wins,
      winRate: roleGames.length ? Math.round((wins / roleGames.length) * 100) : 0,
      streak,
    };
  }), [games]);

  useEffect(() => {
    if (section !== 'club' || clubForm !== null) return;
    let cancelled = false;
    setClubFormLoading(true);
    setClubFormError(null);
    void fetch('/api/player/pulse', { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить данные клуба');
        if (!cancelled) setClubForm(body as ClubFormData);
      })
      .catch((error: any) => { if (!cancelled) setClubFormError(error?.message || 'Не удалось загрузить данные клуба'); })
      .finally(() => { if (!cancelled) setClubFormLoading(false); });
    return () => { cancelled = true; };
  }, [section, clubForm]);

  useEffect(() => {
    if (section !== 'relations' || relationships !== null) return;
    let cancelled = false;
    setRelationshipsLoading(true);
    setRelationshipsError(null);
    void fetch('/api/player/relationships', { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить связи игроков');
        if (!cancelled) setRelationships(body as RelationshipData);
      })
      .catch((error: any) => { if (!cancelled) setRelationshipsError(error?.message || 'Не удалось загрузить связи игроков'); })
      .finally(() => { if (!cancelled) setRelationshipsLoading(false); });
    return () => { cancelled = true; };
  }, [section, relationships]);

  const wins = form.filter((game) => game.won).length;
  const firstResult = form[0]?.won;
  let streak = 0;
  for (const game of form) {
    if (game.won !== firstResult) break;
    streak += 1;
  }
  const streakText = !form.length
    ? 'Сыграй первую завершённую игру — здесь появится форма.'
    : streak >= 2
      ? `${streak} ${firstResult ? 'победы' : 'поражения'} подряд`
      : firstResult ? 'последняя — победа' : 'последняя — поражение';

  const renderDuo = (duo: ClubDuo) => (
    <div key={`${duo.team}:${duo.a_id}:${duo.b_id}`} className="flex items-center gap-2 rounded-2xl bg-white/[0.04] p-2.5">
      <div className="flex -space-x-2"><Avatar src={duo.a_avatar_url} size="sm" /><Avatar src={duo.b_avatar_url} size="sm" /></div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-semibold">{duo.a_name} + {duo.b_name}</div>
        <div className="mt-0.5 text-[10px] text-white/30">{duo.wins}/{duo.games} побед · {duo.win_rate}%</div>
      </div>
    </div>
  );

  return (
    <div>
      <div className="grid grid-cols-4 gap-1 rounded-2xl bg-white/[0.05] p-1">
        {([
          ['mine', 'Моя форма'],
          ['club', 'Клуб'],
          ['relations', 'Связи'],
          ['stories', 'Лента'],
        ] as Array<[Section, string]>).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
            className={`min-h-10 rounded-xl px-1 text-[10px] font-semibold ${section === id ? 'bg-white text-black' : 'text-white/45'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {section === 'mine' && (
        <div className="mt-4">
          {form.length ? (
            <>
              <div className="rounded-[24px] border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.035] p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Последние {form.length} игр</div>
                <div className="mt-2 flex items-end justify-between gap-4">
                  <div><div className="text-3xl font-black">{wins}<span className="text-white/25">/{form.length}</span></div><div className="mt-1 text-[11px] text-white/35">{streakText}</div></div>
                  <div className="text-right"><div className="text-2xl font-semibold">{Math.round((wins / form.length) * 100)}%</div><div className="mt-1 text-[10px] text-white/30">текущая форма</div></div>
                </div>
                <div className="mt-4 flex gap-1.5">{form.map((game, index) => <div key={`${game.id}:bar:${index}`} className={`h-3 flex-1 rounded-full ${game.won ? 'bg-emerald-400' : 'bg-rose-400'}`} />)}</div>
              </div>

              <div className="mt-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Карьера по ролям</div>
                <div className="mt-2 grid grid-cols-2 gap-2">{roleCareer.map((career) => (
                  <div key={career.role} className="rounded-2xl border border-white/[0.06] bg-white/[0.035] p-3">
                    <div className="flex items-center justify-between"><span className="text-lg">{roleIcon(career.role)}</span><span className="text-[10px] text-white/25">{career.games} игр</span></div>
                    <div className="mt-2 text-xs font-semibold">{roleLabel(career.role)}</div>
                    <div className="mt-1 text-lg font-black">{career.games ? `${career.winRate}%` : '—'}</div>
                    <div className="text-[9px] text-white/30">{career.games ? `${career.wins} побед${career.streak >= 2 ? ` · серия ${career.streak}` : ''}` : 'ещё не играл'}</div>
                  </div>
                ))}</div>
              </div>

              <PlayerProgressionPanel />

              <div className="mt-4 space-y-1.5">{form.map((game, index) => (
                <div key={`${game.id}:row:${index}`} className="flex items-center gap-3 rounded-2xl bg-white/[0.04] px-3 py-2.5">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl text-sm ${game.won ? 'bg-emerald-400/12 text-emerald-300' : 'bg-rose-400/12 text-rose-300'}`}>{game.won ? '✓' : '×'}</span>
                  <div className="min-w-0 flex-1"><div className="truncate text-xs font-medium">{game.title || 'Игра 2LA Noire'}</div><div className="mt-0.5 truncate text-[10px] text-white/30">{[shortDate(game.date), game.game_number ? `игра ${game.game_number}` : null, roleLabel(game.role)].filter(Boolean).join(' · ')}</div></div>
                  <span className={`shrink-0 text-[10px] font-semibold ${game.won ? 'text-emerald-300' : 'text-rose-300'}`}>{game.won ? 'Победа' : 'Поражение'}</span>
                </div>
              ))}</div>
            </>
          ) : (
            <>
              <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-5 text-center">
                <div className="text-2xl">🎭</div><div className="mt-2 text-sm font-semibold">Личная форма ещё не началась</div>
                <p className="mt-1 text-xs text-white/35">После первой завершённой игры здесь появятся результаты и карьера по ролям.</p>
                <button type="button" onClick={() => setSection('club')} className="mt-4 min-h-10 rounded-xl bg-white px-4 text-xs font-semibold text-black">Смотреть клуб</button>
              </div>
              <PlayerProgressionPanel />
            </>
          )}
        </div>
      )}

      {section === 'club' && (
        <div className="mt-4">
          {clubFormError && <div className="rounded-2xl bg-rose-400/10 px-3 py-3 text-xs text-rose-200/70">{clubFormError}</div>}
          {clubFormLoading && !clubForm && <div className="rounded-2xl bg-white/[0.04] px-3 py-6 text-center text-xs text-white/35">Считаем форму клуба…</div>}
          {clubForm && (
            <>
              <div className="rounded-[22px] border border-amber-300/10 bg-amber-300/[0.04] p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200/55">🔥 Кто сейчас в огне</div>
                {clubForm.highlights.length ? <div className="mt-3 space-y-2">{clubForm.highlights.map((item) => (
                  <div key={`${item.player_id}:${item.type}`} className="flex items-center gap-3 rounded-2xl bg-black/20 p-2.5">
                    <Avatar src={item.avatar_url} /><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{item.nickname}</div><div className="mt-0.5 text-[11px] text-amber-100/55">{item.text}</div></div><span className="text-lg">{item.type === 'win_streak' ? '🔥' : '⚡'}</span>
                  </div>
                ))}</div> : <p className="mt-3 text-xs text-white/35">Пока никто не собрал серию — самое время начать.</p>}
              </div>

              <div className="mt-4">
                <div className="flex items-end justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Рейтинг формы</div><div className="mt-1 text-sm font-semibold">Кто сильнее всех выглядит прямо сейчас</div></div><div className="text-[10px] text-white/25">{clubForm.players_with_form} в форме</div></div>
                <div className="mt-3 space-y-1.5">{clubForm.power_ranking.slice(0, 10).map((item) => (
                  <div key={item.player_id} className={`flex items-center gap-2.5 rounded-2xl border px-2.5 py-2.5 ${item.player_id === clubForm.viewer_id ? 'border-white/20 bg-white/[0.08]' : 'border-white/[0.04] bg-white/[0.035]'}`}>
                    <div className="w-6 shrink-0 text-center text-sm font-black text-white/40">{item.place}</div><Avatar src={item.avatar_url} size="sm" />
                    <div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">{item.nickname}{item.player_id === clubForm.viewer_id ? ' · вы' : ''}</div><div className="mt-0.5 text-[10px] text-white/30">{item.wins}/{item.games} · {item.win_rate}%{item.streak >= 2 ? ` · серия ${item.streak}` : ''}</div></div>
                    <div className="shrink-0 text-right"><div className="text-xs font-black">{item.score}</div><div className={`text-[9px] font-semibold ${item.movement != null && item.movement > 0 ? 'text-emerald-300' : item.movement != null && item.movement < 0 ? 'text-rose-300' : 'text-white/25'}`}>{movementLabel(item.movement)}</div></div>
                  </div>
                ))}</div>
                <p className="mt-3 text-[10px] leading-4 text-white/25">{clubForm.meta?.formula || 'Рейтинг формы — дополнительный показатель текущих результатов и не заменяет официальный Elo.'}</p>
              </div>
            </>
          )}
        </div>
      )}

      {section === 'relations' && (
        <div className="mt-4">
          {relationshipsError && <div className="rounded-2xl bg-rose-400/10 px-3 py-3 text-xs text-rose-200/70">{relationshipsError}</div>}
          {relationshipsLoading && !relationships && <div className="rounded-2xl bg-white/[0.04] px-3 py-6 text-center text-xs text-white/35">Считаем противостояния и связки…</div>}
          {relationships && (
            <>
              <div><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">⚔️ Противостояния</div>{relationships.rivals.length ? <div className="mt-2 space-y-1.5">{relationships.rivals.slice(0, 5).map((item) => (
                <div key={item.player_id} className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-2.5"><Avatar src={item.avatar_url} /><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">vs {item.nickname}</div><div className="mt-0.5 text-[10px] text-white/30">{item.games} очных игр · ваш винрейт {item.win_rate}%</div></div><div className="text-sm font-black tabular-nums"><span className="text-emerald-300">{item.wins}</span><span className="mx-1 text-white/20">:</span><span className="text-rose-300">{item.games - item.wins}</span></div></div>
              ))}</div> : <p className="mt-2 text-xs text-white/30">Пока недостаточно очных игр.</p>}</div>

              <div className="mt-5"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">🤝 Мои частые напарники</div>{relationships.teammates.length ? <div className="mt-2 space-y-1.5">{relationships.teammates.slice(0, 5).map((item) => (
                <div key={item.player_id} className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-2.5"><Avatar src={item.avatar_url} /><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">{item.nickname}</div><div className="mt-0.5 text-[10px] text-white/30">вместе {item.games} игр · {item.wins} побед</div></div><div className="text-sm font-black">{item.win_rate}%</div></div>
              ))}</div> : <p className="mt-2 text-xs text-white/30">Совместные игры появятся здесь.</p>}</div>

              <div className="mt-5 rounded-[22px] border border-white/[0.06] bg-white/[0.025] p-3"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">🏆 Лучшие связки клуба</div><div className="mt-3 grid gap-3 sm:grid-cols-2"><div><div className="mb-1.5 text-[10px] font-semibold text-rose-300/70">За красных</div><div className="space-y-1.5">{relationships.club_duos.red.slice(0, 3).map(renderDuo)}{!relationships.club_duos.red.length && <div className="text-[10px] text-white/25">Нужно больше совместных игр.</div>}</div></div><div><div className="mb-1.5 text-[10px] font-semibold text-white/55">За чёрных</div><div className="space-y-1.5">{relationships.club_duos.black.slice(0, 3).map(renderDuo)}{!relationships.club_duos.black.length && <div className="text-[10px] text-white/25">Нужно больше совместных игр.</div>}</div></div></div></div>
            </>
          )}
        </div>
      )}

      {section === 'stories' && <div className="mt-4"><PlayerStoriesPanel /></div>}
    </div>
  );
}
