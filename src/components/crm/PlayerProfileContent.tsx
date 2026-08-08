import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  CalendarDays,
  ChevronRight,
  CircleDot,
  Crown,
  Gamepad2,
  Medal,
  Plus,
  RotateCcw,
  Shield,
  Skull,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';
import {
  api,
  type PlayerAwardKey,
  type PlayerAwardStats,
  type PlayerAwardTournament,
  type PlayerDetails,
  type PlayerGameHistoryItem,
  type PlayerTournamentAward,
} from '../../lib/api.ts';
import { PlayerAvatar } from '../ui/PlayerAvatar.tsx';

type ProfileTab = 'overview' | 'games' | 'tournaments' | 'evenings';
type AwardFilter = 'place_1' | 'place_2' | 'place_3' | 'nominations';

const nominationOptions: Array<{ key: PlayerAwardKey; label: string }> = [
  { key: 'nomination_best_citizen', label: 'Лучший мирный' },
  { key: 'nomination_best_mafia', label: 'Лучшая мафия' },
  { key: 'nomination_best_sheriff', label: 'Лучший Шериф' },
  { key: 'nomination_best_don', label: 'Лучший Дон' },
  { key: 'nomination_mvp', label: 'MVP' },
];
const historicalNominationOptions: Array<{ key: PlayerAwardKey; label: string }> = [
  ...nominationOptions,
  { key: 'nomination_other', label: 'Другая номинация' },
];

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

const emptyAwardStats: PlayerAwardStats = { firstPlaces: 0, secondPlaces: 0, thirdPlaces: 0, nominations: 0 };

export const PlayerProfileContent: React.FC<{ player: PlayerDetails }> = ({ player }) => {
  const [tab, setTab] = useState<ProfileTab>('overview');
  const [awardFilter, setAwardFilter] = useState<AwardFilter | null>(null);
  const [awardList, setAwardList] = useState<PlayerTournamentAward[]>(player.tournamentAwards || []);
  const [awardStats, setAwardStats] = useState<PlayerAwardStats>(player.awardStats || emptyAwardStats);
  const [awardTournaments, setAwardTournaments] = useState<PlayerAwardTournament[]>(player.awardTournaments || []);
  const [showAwardEditor, setShowAwardEditor] = useState(false);
  const [awardTournamentId, setAwardTournamentId] = useState(player.awardTournaments?.[0]?.id || '');
  const [awardKey, setAwardKey] = useState<PlayerAwardKey>('place_1');
  const [awardComment, setAwardComment] = useState('');
  const [awardSaving, setAwardSaving] = useState(false);
  const [awardError, setAwardError] = useState<string | null>(null);
  const [showHistoricalEditor, setShowHistoricalEditor] = useState(false);
  const [historicalEditingId, setHistoricalEditingId] = useState<string | null>(null);
  const [historicalTournamentTitle, setHistoricalTournamentTitle] = useState('');
  const [historicalTournamentDate, setHistoricalTournamentDate] = useState('');
  const [historicalAwardKey, setHistoricalAwardKey] = useState<PlayerAwardKey>('place_1');
  const [historicalCustomTitle, setHistoricalCustomTitle] = useState('');
  const [historicalComment, setHistoricalComment] = useState('');

  const stats = player.gameStats;
  const allGames = useMemo(() => [...(player.clubGames || []), ...(player.tournamentGames || [])].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()), [player.clubGames, player.tournamentGames]);
  const recentGames = allGames.slice(0, 3);
  const visits = player.stats?.attendanceCount ?? player.attendance_count ?? 0;

  useEffect(() => {
    setAwardList(player.tournamentAwards || []);
    setAwardStats(player.awardStats || emptyAwardStats);
    setAwardTournaments(player.awardTournaments || []);
    if (!awardTournamentId && player.awardTournaments?.[0]?.id) setAwardTournamentId(player.awardTournaments[0].id);
  }, [player]);

  const refreshAwards = async () => {
    const fresh = await api.getPlayer(player.id);
    setAwardList(fresh.tournamentAwards || []);
    setAwardStats(fresh.awardStats || emptyAwardStats);
    setAwardTournaments(fresh.awardTournaments || []);
  };

  const openAwardHistory = (filter: AwardFilter) => {
    setAwardFilter(filter);
    setShowAwardEditor(false);
    setShowHistoricalEditor(false);
    setHistoricalEditingId(null);
    setHistoricalTournamentTitle('');
    setHistoricalTournamentDate('');
    setHistoricalCustomTitle('');
    setHistoricalComment('');
    setAwardError(null);
    setAwardComment('');
    if (filter === 'nominations') {
      setAwardKey('nomination_best_citizen');
      setHistoricalAwardKey('nomination_best_citizen');
    } else {
      setAwardKey(filter);
      setHistoricalAwardKey(filter);
    }
    if (!awardTournamentId && awardTournaments[0]) setAwardTournamentId(awardTournaments[0].id);
  };

  const filteredAwards = awardList.filter((award) => {
    if (awardFilter === 'nominations') return award.kind === 'nomination';
    return awardFilter ? award.key === awardFilter : false;
  });

  const handleAssignAward = async () => {
    if (!awardTournamentId) return;
    setAwardSaving(true);
    setAwardError(null);
    try {
      await api.setTournamentAwardOverride(awardTournamentId, awardKey, {
        player_id: player.id,
        mode: 'assign',
        comment: awardComment || undefined,
      });
      await refreshAwards();
      setAwardComment('');
      setShowAwardEditor(false);
    } catch (err: any) {
      setAwardError(err.message || 'Не удалось сохранить награду');
    } finally {
      setAwardSaving(false);
    }
  };

  const handleSuppressAward = async (award: PlayerTournamentAward) => {
    if (!award.tournament_id) return;
    if (!window.confirm(`Убрать «${award.title}» за турнир «${award.tournament_title}»?`)) return;
    setAwardSaving(true);
    setAwardError(null);
    try {
      await api.setTournamentAwardOverride(award.tournament_id, award.key, {
        mode: 'suppress',
        comment: `Награда снята вручную из профиля ${player.nickname}`,
      });
      await refreshAwards();
    } catch (err: any) {
      setAwardError(err.message || 'Не удалось убрать награду');
    } finally {
      setAwardSaving(false);
    }
  };

  const handleResetAward = async (award: PlayerTournamentAward) => {
    if (!award.tournament_id) return;
    setAwardSaving(true);
    setAwardError(null);
    try {
      await api.resetTournamentAwardOverride(award.tournament_id, award.key);
      await refreshAwards();
    } catch (err: any) {
      setAwardError(err.message || 'Не удалось вернуть автоматический результат');
    } finally {
      setAwardSaving(false);
    }
  };


  const openHistoricalEditor = () => {
    setShowAwardEditor(false);
    setShowHistoricalEditor(true);
    setHistoricalEditingId(null);
    setHistoricalTournamentTitle('');
    setHistoricalTournamentDate('');
    setHistoricalCustomTitle('');
    setHistoricalComment('');
    setHistoricalAwardKey(awardFilter === 'nominations' ? 'nomination_best_citizen' : (awardFilter || 'place_1'));
    setAwardError(null);
  };

  const editHistoricalAward = (award: PlayerTournamentAward) => {
    if (!award.historical_award_id) return;
    setShowAwardEditor(false);
    setShowHistoricalEditor(true);
    setHistoricalEditingId(award.historical_award_id);
    setHistoricalTournamentTitle(award.tournament_title || '');
    setHistoricalTournamentDate(award.tournament_date ? award.tournament_date.slice(0, 10) : '');
    setHistoricalAwardKey(award.key);
    setHistoricalCustomTitle(award.key === 'nomination_other' ? award.title : '');
    setHistoricalComment(award.comment || '');
    setAwardError(null);
  };

  const closeHistoricalEditor = () => {
    setShowHistoricalEditor(false);
    setHistoricalEditingId(null);
    setHistoricalTournamentTitle('');
    setHistoricalTournamentDate('');
    setHistoricalCustomTitle('');
    setHistoricalComment('');
  };

  const handleSaveHistoricalAward = async () => {
    if (!historicalTournamentTitle.trim()) {
      setAwardError('Укажи название турнира');
      return;
    }
    if (historicalAwardKey === 'nomination_other' && !historicalCustomTitle.trim()) {
      setAwardError('Укажи название номинации');
      return;
    }

    setAwardSaving(true);
    setAwardError(null);
    const payload = {
      award_key: historicalAwardKey,
      tournament_title: historicalTournamentTitle.trim(),
      tournament_date: historicalTournamentDate || null,
      title: historicalAwardKey === 'nomination_other' ? historicalCustomTitle.trim() : undefined,
      comment: historicalComment.trim() || undefined,
    };

    try {
      if (historicalEditingId) {
        await api.updatePlayerHistoricalAward(player.id, historicalEditingId, payload);
      } else {
        await api.createPlayerHistoricalAward(player.id, payload);
      }
      await refreshAwards();
      closeHistoricalEditor();
    } catch (err: any) {
      setAwardError(err.message || 'Не удалось сохранить историческую награду');
    } finally {
      setAwardSaving(false);
    }
  };

  const handleDeleteHistoricalAward = async (award: PlayerTournamentAward) => {
    if (!award.historical_award_id) return;
    if (!window.confirm(`Удалить «${award.title}» за турнир «${award.tournament_title}» из истории?`)) return;
    setAwardSaving(true);
    setAwardError(null);
    try {
      await api.deletePlayerHistoricalAward(player.id, award.historical_award_id);
      await refreshAwards();
    } catch (err: any) {
      setAwardError(err.message || 'Не удалось удалить историческую награду');
    } finally {
      setAwardSaving(false);
    }
  };

  const awardHistoryTitle = awardFilter === 'place_1'
    ? 'Первые места'
    : awardFilter === 'place_2'
      ? 'Вторые места'
      : awardFilter === 'place_3'
        ? 'Третьи места'
        : 'Номинации';

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

          <section className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-slate-900 p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2"><Medal className="w-4 h-4 text-amber-400" /> Турнирные награды</h3>
              <span className="text-[9px] text-slate-500">Нажми на статистику</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 text-center">
              {[
                { filter: 'place_1' as AwardFilter, icon: '🥇', label: '1 место', value: awardStats.firstPlaces },
                { filter: 'place_2' as AwardFilter, icon: '🥈', label: '2 место', value: awardStats.secondPlaces },
                { filter: 'place_3' as AwardFilter, icon: '🥉', label: '3 место', value: awardStats.thirdPlaces },
                { filter: 'nominations' as AwardFilter, icon: '🏅', label: 'Номинации', value: awardStats.nominations },
              ].map((item) => (
                <button
                  key={item.filter}
                  type="button"
                  onClick={() => openAwardHistory(item.filter)}
                  className="min-h-[76px] rounded-xl border border-slate-800 bg-slate-950 p-2 transition hover:border-amber-500/40 active:scale-[0.98]"
                >
                  <span className="text-xl block">{item.icon}</span>
                  <strong className="text-base text-white block">{item.value}</strong>
                  <span className="text-[8px] text-slate-500 flex items-center justify-center gap-0.5">{item.label}<ChevronRight className="w-2.5 h-2.5" /></span>
                </button>
              ))}
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

      {awardFilter && (
        <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={() => setAwardFilter(null)}>
          <div className="w-full sm:max-w-lg max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-slate-800 bg-slate-950 p-4 space-y-4" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2"><Award className="w-5 h-5 text-amber-400" /> {awardHistoryTitle}</h3>
                <p className="text-[10px] text-slate-500 mt-1">Автоматические результаты и добавленная вручную история</p>
              </div>
              <button type="button" aria-label="Закрыть" onClick={() => setAwardFilter(null)} className="w-10 h-10 rounded-xl bg-slate-900 text-slate-400 flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>

            <div className="space-y-2">
              {filteredAwards.length ? filteredAwards.map((award) => (
                <div key={award.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-black text-white">{award.title}</div>
                      <div className="text-[11px] font-bold text-amber-300 mt-0.5 break-words">{award.tournament_title}</div>
                      <div className="text-[9px] text-slate-500 mt-0.5">{fmtDate(award.tournament_date)}</div>
                    </div>
                    <span className={`shrink-0 rounded-lg border px-2 py-1 text-[8px] font-black ${award.source === 'historical' ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : award.source === 'manual' ? 'border-sky-500/30 bg-sky-500/10 text-sky-300' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'}`}>
                      {award.source === 'historical' ? 'ДОБАВЛЕНО ВРУЧНУЮ' : award.source === 'manual' ? 'РУЧНАЯ ПРАВКА' : 'ПО ИТОГАМ'}
                    </span>
                  </div>
                  {award.comment && <div className="rounded-xl bg-slate-950 px-2.5 py-2 text-[10px] text-slate-400">{award.comment}</div>}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {award.source === 'historical' ? (
                      <>
                        <button type="button" disabled={awardSaving} onClick={() => editHistoricalAward(award)} className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-1.5 text-[9px] font-bold text-amber-300 disabled:opacity-50">Изменить</button>
                        <button type="button" disabled={awardSaving} onClick={() => handleDeleteHistoricalAward(award)} className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-2.5 py-1.5 text-[9px] font-bold text-rose-300 disabled:opacity-50">Удалить</button>
                      </>
                    ) : (
                      <>
                        <button type="button" disabled={awardSaving} onClick={() => handleSuppressAward(award)} className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-2.5 py-1.5 text-[9px] font-bold text-rose-300 disabled:opacity-50">Убрать</button>
                        {award.source === 'manual' && (
                          <button type="button" disabled={awardSaving} onClick={() => handleResetAward(award)} className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[9px] font-bold text-slate-300 flex items-center gap-1 disabled:opacity-50"><RotateCcw className="w-3 h-3" />Вернуть расчёт</button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/50 py-8 text-center text-xs text-slate-500">Таких наград пока нет</div>
              )}
            </div>

            {awardError && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-[10px] text-rose-300">{awardError}</div>}

            {!showAwardEditor && !showHistoricalEditor && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button type="button" onClick={openHistoricalEditor} className="min-h-11 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-black flex items-center justify-center gap-2"><Plus className="w-4 h-4" />Добавить прошлую награду</button>
                {awardTournaments.length > 0 && (
                  <button type="button" onClick={() => setShowAwardEditor(true)} className="min-h-11 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-300 text-xs font-black">Исправить турнир в базе</button>
                )}
              </div>
            )}

            {showHistoricalEditor && (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-3">
                <div className="flex items-center justify-between"><strong className="text-xs text-white">{historicalEditingId ? 'Изменить прошлую награду' : 'Добавить прошлую награду'}</strong><button type="button" onClick={closeHistoricalEditor} className="text-[10px] text-slate-500">Закрыть</button></div>
                <div>
                  <label className="text-[9px] uppercase font-black text-slate-500 block mb-1">Название турнира</label>
                  <input value={historicalTournamentTitle} onChange={(event) => setHistoricalTournamentTitle(event.target.value)} maxLength={180} placeholder="Например: Кубок города 2023" className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white placeholder:text-slate-600" />
                </div>
                <div>
                  <label className="text-[9px] uppercase font-black text-slate-500 block mb-1">Дата, если известна</label>
                  <input type="date" value={historicalTournamentDate} onChange={(event) => setHistoricalTournamentDate(event.target.value)} className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white" />
                </div>
                <div>
                  <label className="text-[9px] uppercase font-black text-slate-500 block mb-1">Награда</label>
                  {awardFilter === 'nominations' ? (
                    <select value={historicalAwardKey} onChange={(event) => setHistoricalAwardKey(event.target.value as PlayerAwardKey)} className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white">
                      {historicalNominationOptions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                    </select>
                  ) : (
                    <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs font-bold text-amber-300">{awardHistoryTitle.replace('Первые места', '1 место').replace('Вторые места', '2 место').replace('Третьи места', '3 место')}</div>
                  )}
                </div>
                {historicalAwardKey === 'nomination_other' && (
                  <div>
                    <label className="text-[9px] uppercase font-black text-slate-500 block mb-1">Название номинации</label>
                    <input value={historicalCustomTitle} onChange={(event) => setHistoricalCustomTitle(event.target.value)} maxLength={120} placeholder="Например: Лучший дебют" className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white placeholder:text-slate-600" />
                  </div>
                )}
                <div>
                  <label className="text-[9px] uppercase font-black text-slate-500 block mb-1">Комментарий, необязательно</label>
                  <input value={historicalComment} onChange={(event) => setHistoricalComment(event.target.value)} maxLength={500} placeholder="Откуда взята информация или уточнение" className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white placeholder:text-slate-600" />
                </div>
                <p className="text-[9px] leading-relaxed text-slate-500">Эта запись существует только в профиле игрока и не меняет результаты турниров в базе.</p>
                <button type="button" disabled={awardSaving || !historicalTournamentTitle.trim()} onClick={handleSaveHistoricalAward} className="w-full min-h-11 rounded-xl bg-amber-500 text-slate-950 text-xs font-black disabled:opacity-50">{awardSaving ? 'Сохранение…' : historicalEditingId ? 'Сохранить изменения' : `Добавить: ${player.nickname}`}</button>
              </div>
            )}

            {showAwardEditor && (
              <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-3 space-y-3">
                <div className="flex items-center justify-between"><strong className="text-xs text-white">Исправить результат турнира в базе</strong><button type="button" onClick={() => setShowAwardEditor(false)} className="text-[10px] text-slate-500">Закрыть</button></div>
                <div>
                  <label className="text-[9px] uppercase font-black text-slate-500 block mb-1">Турнир</label>
                  <select value={awardTournamentId} onChange={(event) => setAwardTournamentId(event.target.value)} className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white">
                    <option value="">Выбери турнир</option>
                    {awardTournaments.map((item) => <option key={item.id} value={item.id}>{item.title} · {fmtDate(item.date)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] uppercase font-black text-slate-500 block mb-1">Награда</label>
                  {awardFilter === 'nominations' ? (
                    <select value={awardKey} onChange={(event) => setAwardKey(event.target.value as PlayerAwardKey)} className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white">
                      {nominationOptions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                    </select>
                  ) : (
                    <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs font-bold text-sky-300">{awardHistoryTitle.replace('Первые места', '1 место').replace('Вторые места', '2 место').replace('Третьи места', '3 место')}</div>
                  )}
                </div>
                <div>
                  <label className="text-[9px] uppercase font-black text-slate-500 block mb-1">Комментарий, необязательно</label>
                  <input value={awardComment} onChange={(event) => setAwardComment(event.target.value)} maxLength={500} placeholder="Например: решение главного судьи" className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white placeholder:text-slate-600" />
                </div>
                <p className="text-[9px] leading-relaxed text-slate-500">Это меняет официальный результат существующего турнира. Для призовых мест система сохраняет уникальные 1–3 места и при необходимости переставляет игроков.</p>
                <button type="button" disabled={awardSaving || !awardTournamentId} onClick={handleAssignAward} className="w-full min-h-11 rounded-xl bg-sky-500 text-slate-950 text-xs font-black disabled:opacity-50">{awardSaving ? 'Сохранение…' : `Назначить: ${player.nickname}`}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
