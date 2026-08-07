import React, { useMemo, useState } from 'react';
import { CalendarDays, CircleDot, Crown, Gamepad2, Shield, Skull, Sparkles, Trophy } from 'lucide-react';
import { PlayerDetails, PlayerGameHistoryItem } from '../../lib/api.ts';
import { PlayerAvatar } from '../ui/PlayerAvatar.tsx';

type ProfileTab = 'overview' | 'games' | 'tournaments' | 'evenings';

const roleInfo = (role: string | null) => {
  if (role === 'don') return { label: 'Дон', icon: '🎩', cls: 'text-purple-300 border-purple-500/30 bg-purple-500/10' };
  if (role === 'mafia') return { label: 'Мафия', icon: '🔫', cls: 'text-rose-300 border-rose-500/30 bg-rose-500/10' };
  if (role === 'sheriff') return { label: 'Шериф', icon: '⭐', cls: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' };
  if (role === 'citizen') return { label: 'Мирный', icon: '❤️', cls: 'text-sky-300 border-sky-500/30 bg-sky-500/10' };
  return { label: 'Роль не указана', icon: '•', cls: 'text-slate-400 border-slate-700 bg-slate-800/40' };
};

const exitLabel = (value: string | null) => {
  if (value === 'killed') return 'Убит ночью';
  if (value === 'voted_zero_round') return 'Ушёл в 0 круге';
  if (value === 'voted_day') return 'Ушёл голосованием';
  if (value === 'removed') return 'Удалён';
  if (value === 'alive') return 'Дожил до конца';
  return value || '—';
};

const fmtDate = (value: string | null | undefined) => {
  if (!value) return 'Дата не указана';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });
};

const GameCard: React.FC<{ game: PlayerGameHistoryItem }> = ({ game }) => {
  const role = roleInfo(game.role);
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3 space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-black text-white truncate">{game.title}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">{fmtDate(game.date)} · Игра #{game.game_number || '—'}{game.table_name ? ` · ${game.table_name}` : ''}</div>
        </div>
        {game.status === 'completed' ? (
          <span className={`shrink-0 rounded-lg border px-2 py-1 text-[9px] font-black ${game.won ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/30 bg-rose-500/10 text-rose-300'}`}>
            {game.won ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'}
          </span>
        ) : (
          <span className="shrink-0 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[9px] font-black text-slate-400">{game.status.toUpperCase()}</span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className={`rounded-lg border px-2 py-1 text-[10px] font-bold ${role.cls}`}>{role.icon} {role.label}</span>
        <span className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-bold text-slate-300">Место #{game.seat_number || '—'}</span>
        {game.best_move && <span className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-300">🏆 ЛХ</span>}
        {game.first_killed && <span className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[10px] font-bold text-rose-300">ПУ</span>}
        {game.zero_round_voted && <span className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-[10px] font-bold text-orange-300">0 круг</span>}
      </div>

      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <div className="rounded-xl bg-slate-900 px-2.5 py-2"><span className="text-slate-500 block">Итог за столом</span><strong className="text-slate-200">{exitLabel(game.exit_type)}</strong></div>
        <div className="rounded-xl bg-slate-900 px-2.5 py-2"><span className="text-slate-500 block">Фолы</span><strong className="text-slate-200">{game.regular_fouls} · тех {game.minor_technical_fouls + game.major_technical_fouls}</strong></div>
      </div>
    </div>
  );
};

export const PlayerProfileContent: React.FC<{ player: PlayerDetails }> = ({ player }) => {
  const [tab, setTab] = useState<ProfileTab>('overview');
  const stats = player.gameStats;
  const allGames = useMemo(() => [...(player.clubGames || []), ...(player.tournamentGames || [])].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()), [player.clubGames, player.tournamentGames]);
  const recentGames = allGames.slice(0, 3);
  const visits = player.stats?.attendanceCount ?? player.attendance_count ?? 0;

  return (
    <div className="space-y-4 pb-6">
      <section className="rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-rose-950/30 p-4 overflow-hidden relative">
        <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-rose-500/10 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <PlayerAvatar playerId={player.id} avatarVersion={player.avatar_updated_at} nickname={player.nickname} size="xl" className="ring-2 ring-rose-500/20" />
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-black text-white leading-tight break-words">{player.nickname}</h2>
            {player.full_name && <p className="text-xs text-slate-400 mt-1 break-words">{player.full_name}</p>}
            {player.telegram_username && <p className="text-[11px] text-sky-400 mt-1">@{player.telegram_username.replace('@', '')}</p>}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1.5 mt-4 text-center">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-1.5 py-2"><span className="block text-[8px] uppercase text-slate-500">Игры</span><strong className="text-base text-white">{stats?.totalGames || 0}</strong></div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-1.5 py-2"><span className="block text-[8px] uppercase text-slate-500">Победы</span><strong className="text-base text-emerald-400">{stats?.wins || 0}</strong></div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-1.5 py-2"><span className="block text-[8px] uppercase text-slate-500">Винрейт</span><strong className="text-base text-amber-300">{stats?.winRate || 0}%</strong></div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-1.5 py-2"><span className="block text-[8px] uppercase text-slate-500">Вечера</span><strong className="text-base text-sky-300">{visits}</strong></div>
        </div>
      </section>

      <div className="grid grid-cols-4 gap-1 rounded-2xl border border-slate-800 bg-slate-950 p-1">
        {([
          ['overview', 'Обзор'],
          ['games', 'Игры'],
          ['tournaments', 'Турниры'],
          ['evenings', 'Вечера'],
        ] as Array<[ProfileTab, string]>).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`min-h-10 rounded-xl text-[9px] font-black ${tab === id ? 'bg-rose-600 text-white' : 'text-slate-500'}`}>{label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-3.5">
            <h3 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2"><Shield className="w-4 h-4 text-rose-400" /> Роли</h3>
            <div className="grid grid-cols-4 gap-1.5 mt-3 text-center">
              {[
                ['❤️', 'Мирный', stats?.roleCounts?.citizen || 0],
                ['⭐', 'Шериф', stats?.roleCounts?.sheriff || 0],
                ['🔫', 'Мафия', stats?.roleCounts?.mafia || 0],
                ['🎩', 'Дон', stats?.roleCounts?.don || 0],
              ].map(([icon, label, count]) => <div key={String(label)} className="rounded-xl bg-slate-950 p-2"><span className="text-lg block">{icon}</span><strong className="text-sm text-white block">{count}</strong><span className="text-[8px] text-slate-500">{label}</span></div>)}
            </div>
          </section>

          <section className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 text-center"><Trophy className="w-5 h-5 text-amber-400 mx-auto" /><strong className="text-lg text-white block mt-1">{stats?.bestMoves || 0}</strong><span className="text-[9px] text-amber-300">Лучший ход</span></div>
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-3 text-center"><Skull className="w-5 h-5 text-rose-400 mx-auto" /><strong className="text-lg text-white block mt-1">{stats?.firstKilled || 0}</strong><span className="text-[9px] text-rose-300">ПУ</span></div>
            <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-3 text-center"><CircleDot className="w-5 h-5 text-orange-400 mx-auto" /><strong className="text-lg text-white block mt-1">{stats?.zeroRoundVoted || 0}</strong><span className="text-[9px] text-orange-300">0 круг</span></div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between"><h3 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2"><Sparkles className="w-4 h-4 text-sky-400" /> Последние игры</h3>{allGames.length > 3 && <button type="button" onClick={() => setTab('games')} className="text-[9px] font-bold text-rose-400">Все игры →</button>}</div>
            {recentGames.length ? recentGames.map((game) => <GameCard key={game.id} game={game} />) : <div className="py-6 text-center text-xs text-slate-500">Сыгранных протоколов пока нет</div>}
          </section>
        </div>
      )}

      {tab === 'games' && (
        <section className="space-y-2.5">
          <div className="flex items-center gap-2 px-1"><Gamepad2 className="w-4 h-4 text-rose-400" /><h3 className="text-xs font-black uppercase text-white">Клубные игры · {player.clubGames?.length || 0}</h3></div>
          {player.clubGames?.length ? player.clubGames.map((game) => <GameCard key={game.id} game={game} />) : <div className="rounded-2xl border border-slate-800 bg-slate-900 py-10 text-center text-xs text-slate-500">Обычных игр пока нет</div>}
        </section>
      )}

      {tab === 'tournaments' && (
        <section className="space-y-2.5">
          <div className="flex items-center gap-2 px-1"><Crown className="w-4 h-4 text-amber-400" /><h3 className="text-xs font-black uppercase text-white">Турнирные игры · {player.tournamentGames?.length || 0}</h3></div>
          {player.tournamentGames?.length ? player.tournamentGames.map((game) => <GameCard key={game.id} game={game} />) : <div className="rounded-2xl border border-slate-800 bg-slate-900 py-10 text-center text-xs text-slate-500">Турнирных игр пока нет</div>}
        </section>
      )}

      {tab === 'evenings' && (
        <section className="space-y-2.5">
          <div className="flex items-center gap-2 px-1"><CalendarDays className="w-4 h-4 text-sky-400" /><h3 className="text-xs font-black uppercase text-white">История вечеров</h3></div>
          {player.eveningHistory?.length ? player.eveningHistory.map((item: any) => (
            <div key={item.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-3 flex items-center justify-between gap-3">
              <div className="min-w-0"><strong className="text-xs text-white block truncate">{item.evening_title || 'Игровой вечер'}</strong><span className="text-[10px] text-slate-500">{fmtDate(item.evening_date)}</span></div>
              <span className={`shrink-0 rounded-lg px-2 py-1 text-[9px] font-black ${item.attendance_status === 'attended' ? 'bg-emerald-500/10 text-emerald-300' : item.attendance_status === 'no_show' ? 'bg-rose-500/10 text-rose-300' : item.registration_status === 'cancelled' ? 'bg-slate-700 text-slate-400' : 'bg-sky-500/10 text-sky-300'}`}>
                {item.attendance_status === 'attended' ? 'БЫЛ' : item.attendance_status === 'no_show' ? 'НЕ ПРИШЁЛ' : item.registration_status === 'cancelled' ? 'ОТМЕНИЛ' : 'ЗАПИСАН'}
              </span>
            </div>
          )) : <div className="rounded-2xl border border-slate-800 bg-slate-900 py-10 text-center text-xs text-slate-500">Истории вечеров пока нет</div>}
        </section>
      )}
    </div>
  );
};
