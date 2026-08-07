from pathlib import Path

SERVICE = r'''export type PlayerGameSource = 'club' | 'tournament';
export type PlayerGameTeam = 'red' | 'black' | null;

export interface PlayerGameHistoryItem {
  id: string;
  source: PlayerGameSource;
  evening_id: string | null;
  tournament_id: string | null;
  title: string;
  date: string | null;
  game_number: number;
  global_game_number: number | null;
  table_name: string | null;
  judge_name: string | null;
  seat_number: number;
  role: string | null;
  team: PlayerGameTeam;
  winner_team: PlayerGameTeam;
  status: string;
  won: boolean | null;
  exit_type: string | null;
  regular_fouls: number;
  minor_technical_fouls: number;
  major_technical_fouls: number;
  judge_bonus: number;
  protocol_bonus: number;
  ci_points: number;
  penalty_points: number;
  disciplinary_penalty_points: number;
  best_move: boolean;
  best_move_source: 'first_killed' | 'zero_round_voted' | null;
  first_killed: boolean;
  zero_round_voted: boolean;
}

export interface PlayerGameProfileStats {
  totalGames: number;
  completedGames: number;
  wins: number;
  losses: number;
  winRate: number;
  clubGames: number;
  tournamentGames: number;
  redGames: number;
  blackGames: number;
  bestMoves: number;
  firstKilled: number;
  zeroRoundVoted: number;
  lastGameAt: string | null;
  roleCounts: {
    citizen: number;
    sheriff: number;
    mafia: number;
    don: number;
    unknown: number;
  };
}

const safeJsonParse = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const normalizeRole = (role: unknown): 'citizen' | 'sheriff' | 'mafia' | 'don' | null => {
  const value = String(role || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  if (!value) return null;
  if (value === 'citizen' || value === 'мирный' || value === 'мирный житель' || value === 'красный') return 'citizen';
  if (value === 'sheriff' || value === 'шериф') return 'sheriff';
  if (value === 'mafia' || value === 'мафия' || value === 'маф') return 'mafia';
  if (value === 'don' || value === 'дон') return 'don';
  return null;
};

const teamFromRole = (role: unknown): PlayerGameTeam => {
  const normalized = normalizeRole(role);
  if (normalized === 'mafia' || normalized === 'don') return 'black';
  if (normalized === 'citizen' || normalized === 'sheriff') return 'red';
  return null;
};

const normalizeWinner = (winner: unknown): PlayerGameTeam => {
  const value = String(winner || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  if (value === 'red' || value === 'красные' || value === 'красная' || value === 'город') return 'red';
  if (value === 'black' || value === 'черные' || value === 'черная' || value === 'мафия') return 'black';
  return null;
};

const numberOrZero = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

export const buildPlayerProfileStats = (games: PlayerGameHistoryItem[]): PlayerGameProfileStats => {
  const completed = games.filter((game) => game.status === 'completed' && game.winner_team !== null);
  const wins = completed.filter((game) => game.won === true).length;
  const roleCounts = { citizen: 0, sheriff: 0, mafia: 0, don: 0, unknown: 0 };

  for (const game of games) {
    const role = normalizeRole(game.role);
    if (role) roleCounts[role] += 1;
    else roleCounts.unknown += 1;
  }

  const dated = games
    .map((game) => game.date)
    .filter((date): date is string => Boolean(date && !Number.isNaN(new Date(date).getTime())))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  return {
    totalGames: games.length,
    completedGames: completed.length,
    wins,
    losses: Math.max(0, completed.length - wins),
    winRate: completed.length ? Math.round((wins / completed.length) * 100) : 0,
    clubGames: games.filter((game) => game.source === 'club').length,
    tournamentGames: games.filter((game) => game.source === 'tournament').length,
    redGames: games.filter((game) => game.team === 'red').length,
    blackGames: games.filter((game) => game.team === 'black').length,
    bestMoves: games.filter((game) => game.best_move).length,
    firstKilled: games.filter((game) => game.first_killed).length,
    zeroRoundVoted: games.filter((game) => game.zero_round_voted).length,
    lastGameAt: dated[0] || null,
    roleCounts,
  };
};

export const loadPlayerGameProfile = async (db: any, playerId: string) => {
  const clubRows = await db.all(`
    SELECT g.id, g.global_game_number, g.game_date, g.winner_team, g.judge_name, g.protocol_text,
           g.evening_id, e.title AS evening_title, e.starts_at AS evening_date,
           et.name AS table_name
      FROM games g
 LEFT JOIN game_evenings e ON e.id = g.evening_id
 LEFT JOIN evening_tables et ON et.id = g.evening_table_id
     WHERE g.evening_id IS NOT NULL
       AND g.archived_at IS NULL
       AND g.protocol_text IS NOT NULL
  ORDER BY COALESCE(e.starts_at, g.game_date) DESC, g.global_game_number DESC, g.id DESC
  `);

  const clubGames: PlayerGameHistoryItem[] = [];
  for (const row of clubRows) {
    const payload = safeJsonParse<any>(row.protocol_text, null);
    if (!payload || payload.kind !== 'club_evening_protocol' || !Array.isArray(payload.player_results)) continue;
    const result = payload.player_results.find((item: any) => String(item.player_id || '') === String(playerId));
    if (!result) continue;

    const protocol = payload.protocol || {};
    const role = normalizeRole(result.role);
    const team = teamFromRole(role);
    const winner = normalizeWinner(protocol.winner_team || row.winner_team);
    const status = protocol.status === 'completed' ? 'completed' : 'draft';
    const bestMove = Array.isArray(protocol.best_moves)
      ? protocol.best_moves.find((item: any) => String(item.participant_id || '') === String(result.participant_id || ''))
      : null;

    clubGames.push({
      id: `club:${row.id}`,
      source: 'club',
      evening_id: row.evening_id ? String(row.evening_id) : null,
      tournament_id: null,
      title: row.evening_title || 'Клубный вечер',
      date: row.evening_date || row.game_date || null,
      game_number: numberOrZero(row.global_game_number),
      global_game_number: row.global_game_number == null ? null : numberOrZero(row.global_game_number),
      table_name: row.table_name || null,
      judge_name: row.judge_name || null,
      seat_number: numberOrZero(result.seat_number),
      role,
      team,
      winner_team: winner,
      status,
      won: status === 'completed' && team && winner ? team === winner : null,
      exit_type: result.exit_type || null,
      regular_fouls: numberOrZero(result.regular_fouls),
      minor_technical_fouls: numberOrZero(result.minor_technical_fouls),
      major_technical_fouls: numberOrZero(result.major_technical_fouls),
      judge_bonus: numberOrZero(result.judge_bonus),
      protocol_bonus: numberOrZero(result.protocol_bonus),
      ci_points: numberOrZero(result.ci_points),
      penalty_points: numberOrZero(result.penalty_points),
      disciplinary_penalty_points: numberOrZero(result.disciplinary_penalty_points),
      best_move: Boolean(bestMove),
      best_move_source: bestMove?.source === 'first_killed' || bestMove?.source === 'zero_round_voted' ? bestMove.source : null,
      first_killed: String(protocol.first_killed_participant_id || '') === String(result.participant_id || ''),
      zero_round_voted: String(protocol.zero_round_voted_participant_id || '') === String(result.participant_id || ''),
    });
  }

  const tournamentRows = await db.all(`
    SELECT t.id AS tournament_id, t.title AS tournament_title, t.date AS tournament_date,
           tg.id AS game_id, tg.game_number, tg.status AS game_status, tg.winner_team,
           tg.judge_name, tg.completed_at,
           tp.id AS participant_id,
           tgs.seat_number, tgs.role,
           tgpr.exit_type, tgpr.regular_fouls, tgpr.minor_technical_fouls,
           tgpr.major_technical_fouls, tgpr.judge_bonus, tgpr.protocol_bonus,
           tgpr.ci_points, tgpr.penalty_points, tgpr.disciplinary_penalty_points,
           tgp.first_killed_participant_id, tgp.zero_round_voted_participant_id,
           tgbm.source AS best_move_source
      FROM tournament_participants tp
      JOIN tournaments t ON t.id = tp.tournament_id
      JOIN tournament_game_seats tgs ON tgs.participant_id = tp.id
      JOIN tournament_games tg ON tg.id = tgs.game_id
 LEFT JOIN tournament_game_player_results tgpr ON tgpr.game_id = tg.id AND tgpr.participant_id = tp.id
 LEFT JOIN tournament_game_protocols tgp ON tgp.game_id = tg.id
 LEFT JOIN tournament_game_best_moves tgbm ON tgbm.game_id = tg.id AND tgbm.participant_id = tp.id
     WHERE tp.player_id = ?
  ORDER BY t.date DESC, tg.game_number DESC
  `, [playerId]);

  const tournamentGames: PlayerGameHistoryItem[] = tournamentRows.map((row: any) => {
    const role = normalizeRole(row.role);
    const team = teamFromRole(role);
    const winner = normalizeWinner(row.winner_team);
    const status = row.game_status === 'completed' ? 'completed' : row.game_status || 'planned';
    const bestMoveSource = row.best_move_source === 'first_killed' || row.best_move_source === 'zero_round_voted'
      ? row.best_move_source
      : null;

    return {
      id: `tournament:${row.game_id}`,
      source: 'tournament' as const,
      evening_id: null,
      tournament_id: String(row.tournament_id),
      title: row.tournament_title || 'Турнир',
      date: row.completed_at || row.tournament_date || null,
      game_number: numberOrZero(row.game_number),
      global_game_number: null,
      table_name: null,
      judge_name: row.judge_name || null,
      seat_number: numberOrZero(row.seat_number),
      role,
      team,
      winner_team: winner,
      status,
      won: status === 'completed' && team && winner ? team === winner : null,
      exit_type: row.exit_type || null,
      regular_fouls: numberOrZero(row.regular_fouls),
      minor_technical_fouls: numberOrZero(row.minor_technical_fouls),
      major_technical_fouls: numberOrZero(row.major_technical_fouls),
      judge_bonus: numberOrZero(row.judge_bonus),
      protocol_bonus: numberOrZero(row.protocol_bonus),
      ci_points: numberOrZero(row.ci_points),
      penalty_points: numberOrZero(row.penalty_points),
      disciplinary_penalty_points: numberOrZero(row.disciplinary_penalty_points),
      best_move: Boolean(bestMoveSource),
      best_move_source: bestMoveSource,
      first_killed: String(row.first_killed_participant_id || '') === String(row.participant_id || ''),
      zero_round_voted: String(row.zero_round_voted_participant_id || '') === String(row.participant_id || ''),
    };
  });

  const allGames = [...clubGames, ...tournamentGames].sort((a, b) => {
    const aTime = a.date ? new Date(a.date).getTime() : 0;
    const bTime = b.date ? new Date(b.date).getTime() : 0;
    return bTime - aTime;
  });

  return {
    clubGames,
    tournamentGames,
    gameStats: buildPlayerProfileStats(allGames),
  };
};
'''

COMPONENT = r'''import React, { useMemo, useState } from 'react';
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
'''

TEST = r'''import { describe, expect, it } from 'vitest';
import { buildPlayerProfileStats, PlayerGameHistoryItem } from '../server/services/playerProfileService.ts';

const game = (patch: Partial<PlayerGameHistoryItem> = {}): PlayerGameHistoryItem => ({
  id: Math.random().toString(), source: 'club', evening_id: 'e1', tournament_id: null,
  title: 'Вечер', date: '2026-08-01T20:00:00.000Z', game_number: 1, global_game_number: 1,
  table_name: 'Основной', judge_name: null, seat_number: 1, role: 'citizen', team: 'red',
  winner_team: 'red', status: 'completed', won: true, exit_type: 'alive', regular_fouls: 0,
  minor_technical_fouls: 0, major_technical_fouls: 0, judge_bonus: 0, protocol_bonus: 0,
  ci_points: 0, penalty_points: 0, disciplinary_penalty_points: 0, best_move: false,
  best_move_source: null, first_killed: false, zero_round_voted: false, ...patch,
});

describe('player profile stats', () => {
  it('counts wins, roles, sources and protocol markers', () => {
    const stats = buildPlayerProfileStats([
      game({ role: 'citizen', team: 'red', won: true, best_move: true }),
      game({ id: '2', role: 'mafia', team: 'black', winner_team: 'red', won: false, first_killed: true }),
      game({ id: '3', source: 'tournament', tournament_id: 't1', evening_id: null, role: 'don', team: 'black', winner_team: 'black', won: true, zero_round_voted: true }),
      game({ id: '4', source: 'tournament', tournament_id: 't1', evening_id: null, role: 'sheriff', team: 'red', status: 'planned', winner_team: null, won: null }),
    ]);

    expect(stats.totalGames).toBe(4);
    expect(stats.completedGames).toBe(3);
    expect(stats.wins).toBe(2);
    expect(stats.losses).toBe(1);
    expect(stats.winRate).toBe(67);
    expect(stats.clubGames).toBe(2);
    expect(stats.tournamentGames).toBe(2);
    expect(stats.roleCounts).toEqual({ citizen: 1, sheriff: 1, mafia: 1, don: 1, unknown: 0 });
    expect(stats.bestMoves).toBe(1);
    expect(stats.firstKilled).toBe(1);
    expect(stats.zeroRoundVoted).toBe(1);
  });
});
'''

Path('src/server/services/playerProfileService.ts').write_text(SERVICE, encoding='utf-8')
Path('src/components/crm/PlayerProfileContent.tsx').write_text(COMPONENT, encoding='utf-8')
Path('src/tests/playerProfileService.test.ts').write_text(TEST, encoding='utf-8')

# playersRoutes: import service and enrich detail response.
p = Path('src/server/routes/playersRoutes.ts')
s = p.read_text(encoding='utf-8')
anchor = "import { createPreviewCheckpoint } from '../../db/previewDatabaseCheckpoint.ts';\n"
if anchor not in s: raise SystemExit('playersRoutes import anchor missing')
s = s.replace(anchor, anchor + "import { loadPlayerGameProfile } from '../services/playerProfileService.ts';\n", 1)
anchor2 = "    const nextTask = tasks.find((t: any) => t.status === 'todo' || t.status === 'in_progress') || null;\n\n    res.json({\n"
if anchor2 not in s: raise SystemExit('playersRoutes response anchor missing')
s = s.replace(anchor2, "    const nextTask = tasks.find((t: any) => t.status === 'todo' || t.status === 'in_progress') || null;\n    const gameProfile = await loadPlayerGameProfile(db, req.params.id);\n\n    res.json({\n", 1)
s = s.replace("      activities,\n    });", "      activities,\n      ...gameProfile,\n    });", 1)
p.write_text(s, encoding='utf-8')

# api.ts: add profile types after Player, update getPlayer typing.
p = Path('src/lib/api.ts')
s = p.read_text(encoding='utf-8')
player_end = "}\n\nexport interface EveningTable {"
if player_end not in s: raise SystemExit('api Player interface anchor missing')
PROFILE_TYPES = r''' }

export interface PlayerGameHistoryItem {
  id: string;
  source: 'club' | 'tournament';
  evening_id: string | null;
  tournament_id: string | null;
  title: string;
  date: string | null;
  game_number: number;
  global_game_number: number | null;
  table_name: string | null;
  judge_name: string | null;
  seat_number: number;
  role: 'citizen' | 'sheriff' | 'mafia' | 'don' | null;
  team: 'red' | 'black' | null;
  winner_team: 'red' | 'black' | null;
  status: string;
  won: boolean | null;
  exit_type: string | null;
  regular_fouls: number;
  minor_technical_fouls: number;
  major_technical_fouls: number;
  judge_bonus: number;
  protocol_bonus: number;
  ci_points: number;
  penalty_points: number;
  disciplinary_penalty_points: number;
  best_move: boolean;
  best_move_source: 'first_killed' | 'zero_round_voted' | null;
  first_killed: boolean;
  zero_round_voted: boolean;
}

export interface PlayerGameProfileStats {
  totalGames: number;
  completedGames: number;
  wins: number;
  losses: number;
  winRate: number;
  clubGames: number;
  tournamentGames: number;
  redGames: number;
  blackGames: number;
  bestMoves: number;
  firstKilled: number;
  zeroRoundVoted: number;
  lastGameAt: string | null;
  roleCounts: { citizen: number; sheriff: number; mafia: number; don: number; unknown: number };
}

export interface PlayerDetails extends Player {
  stats: any;
  futureBookings: EveningParticipant[];
  attendedEvenings: EveningParticipant[];
  cancelledEvenings: EveningParticipant[];
  noShowEvenings: EveningParticipant[];
  eveningHistory: EveningParticipant[];
  tasks: OrganizerTask[];
  nextTask: OrganizerTask | null;
  transactions: any[];
  activities: PlayerActivity[];
  clubGames: PlayerGameHistoryItem[];
  tournamentGames: PlayerGameHistoryItem[];
  gameStats: PlayerGameProfileStats;
}

export interface EveningTable {'''
# Keep closing brace from Player only once.
s = s.replace(player_end, PROFILE_TYPES, 1)
old = """  getPlayer: (id: string) =>
    request<
      Player & {
        stats: any;
        futureBookings: EveningParticipant[];
        attendedEvenings: EveningParticipant[];
        cancelledEvenings: EveningParticipant[];
        noShowEvenings: EveningParticipant[];
        eveningHistory: EveningParticipant[];
        tasks: OrganizerTask[];
        nextTask: OrganizerTask | null;
        transactions: any[];
      }
    >(`/api/players/${id}`),"""
new = """  getPlayer: (id: string) => request<PlayerDetails>(`/api/players/${id}`),"""
if old not in s: raise SystemExit('api getPlayer typing anchor missing')
s = s.replace(old, new, 1)
p.write_text(s, encoding='utf-8')

# PlayersCRM: open profile by default and retain current CRM drawer as second mode.
p = Path('src/components/crm/PlayersCRM.tsx')
s = p.read_text(encoding='utf-8')
import_anchor = "import { preparePlayerAvatar } from '../../lib/playerAvatarImage.ts';\n"
if import_anchor not in s: raise SystemExit('PlayersCRM import anchor missing')
s = s.replace(import_anchor, import_anchor + "import { PlayerProfileContent } from './PlayerProfileContent.tsx';\n", 1)
state_anchor = "  const [loadingDetails, setLoadingDetails] = useState(false);\n"
if state_anchor not in s: raise SystemExit('PlayersCRM state anchor missing')
s = s.replace(state_anchor, state_anchor + "  const [playerCardView, setPlayerCardView] = useState<'profile' | 'crm'>('profile');\n", 1)
sel = """    if (selectedPlayerId) {
      setActivePlayerCardId(selectedPlayerId);
      loadPlayerDetails(selectedPlayerId);
    }"""
if sel not in s: raise SystemExit('PlayersCRM selected effect missing')
s = s.replace(sel, """    if (selectedPlayerId) {
      setPlayerCardView('profile');
      setActivePlayerCardId(selectedPlayerId);
      loadPlayerDetails(selectedPlayerId);
    }""", 1)
open_anchor = """  const handleOpenCard = (id: string) => {
    setActivePlayerCardId(id);
    loadPlayerDetails(id);
  };"""
if open_anchor not in s: raise SystemExit('PlayersCRM handleOpenCard missing')
s = s.replace(open_anchor, """  const handleOpenCard = (id: string) => {
    setPlayerCardView('profile');
    setActivePlayerCardId(id);
    loadPlayerDetails(id);
  };""", 1)
close_anchor = """    setPlayerDetails(null);
    setIsEditMode(false);"""
s = s.replace(close_anchor, """    setPlayerDetails(null);
    setPlayerCardView('profile');
    setIsEditMode(false);""", 1)

# Change old drawer condition to CRM only.
drawer = "      {activePlayerCardId && (\n        <div className=\"fixed inset-0 z-50 flex justify-end bg-black/80 backdrop-blur-sm p-0 sm:p-4\">"
if drawer not in s: raise SystemExit('PlayersCRM drawer anchor missing')
profile_overlay = r'''      {activePlayerCardId && playerCardView === 'profile' && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm p-0 sm:p-4">
          <div className="mx-auto flex h-full w-full max-w-2xl flex-col bg-slate-950 sm:rounded-3xl sm:border sm:border-slate-800 overflow-hidden">
            <div className="shrink-0 border-b border-slate-800 bg-slate-950/95 px-3 py-2.5 flex items-center gap-2">
              <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-800 bg-slate-900 p-1 flex-1">
                <button type="button" className="min-h-9 rounded-lg bg-rose-600 text-[10px] font-black text-white">ПРОФИЛЬ</button>
                <button type="button" onClick={() => setPlayerCardView('crm')} className="min-h-9 rounded-lg text-[10px] font-black text-slate-400">CRM</button>
              </div>
              <button type="button" aria-label="Закрыть профиль" onClick={handleCloseCard} className="w-11 h-11 rounded-xl border border-slate-800 bg-slate-900 text-slate-400 flex items-center justify-center"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 sm:p-5">
              {loadingDetails || !playerDetails ? <div className="py-20 text-center text-xs text-slate-500">Загрузка профиля…</div> : <PlayerProfileContent player={playerDetails} />}
            </div>
          </div>
        </div>
      )}

      {activePlayerCardId && playerCardView === 'crm' && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/80 backdrop-blur-sm p-0 sm:p-4">'''
s = s.replace(drawer, profile_overlay, 1)

# Add profile switch button near top of CRM drawer close button, minimal insertion.
crm_close = """            <button
              onClick={handleCloseCard}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 rounded-full bg-slate-800 cursor-pointer"
            >"""
if crm_close not in s: raise SystemExit('CRM close button anchor missing')
crm_switch = """            <button
              type="button"
              onClick={() => setPlayerCardView('profile')}
              className="sticky top-0 z-10 mb-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[10px] font-black text-rose-300"
            >
              ← Игровой профиль
            </button>

""" + crm_close
s = s.replace(crm_close, crm_switch, 1)
p.write_text(s, encoding='utf-8')

print('player profiles patch applied')
