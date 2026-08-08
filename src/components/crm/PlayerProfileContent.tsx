import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  CircleDot,
  Medal,
  Plus,
  RotateCcw,
  Shield,
  Skull,
  Sparkles,
  Trophy,
} from 'lucide-react';
import {
  api,
  type PlayerAwardKey,
  type PlayerAwardStats,
  type PlayerAwardTournament,
  type PlayerDetails,
  type PlayerTournamentAward,
} from '../../lib/api.ts';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { MobileSheet } from '../ui/MobileSheet.tsx';
import { PlayerGameCard } from './PlayerGameCard.tsx';

type AwardFilter = 'place_1' | 'place_2' | 'place_3' | 'nominations';

interface PlayerProfileContentProps {
  player: PlayerDetails;
  onOpenGames?: () => void;
}

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

const fmtDate = (value: string | null | undefined) => {
  if (!value) return 'Дата не указана';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });
};

const emptyAwardStats: PlayerAwardStats = {
  firstPlaces: 0,
  secondPlaces: 0,
  thirdPlaces: 0,
  nominations: 0,
};

export const PlayerProfileContent: React.FC<PlayerProfileContentProps> = ({ player, onOpenGames }) => {
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
  const [awardConfirm, setAwardConfirm] = useState<{
    action: 'suppress' | 'deleteHistorical';
    award: PlayerTournamentAward;
  } | null>(null);

  const stats = player.gameStats;
  const visits = player.stats?.attendanceCount ?? player.attendance_count ?? 0;

  const allGames = useMemo(
    () => [...(player.clubGames || []), ...(player.tournamentGames || [])]
      .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()),
    [player.clubGames, player.tournamentGames],
  );
  const recentGames = allGames.slice(0, 3);

  useEffect(() => {
    setAwardList(player.tournamentAwards || []);
    setAwardStats(player.awardStats || emptyAwardStats);
    setAwardTournaments(player.awardTournaments || []);
    setAwardTournamentId((current) => current || player.awardTournaments?.[0]?.id || '');
  }, [player]);

  const refreshAwards = async () => {
    const fresh = await api.getPlayer(player.id);
    setAwardList(fresh.tournamentAwards || []);
    setAwardStats(fresh.awardStats || emptyAwardStats);
    setAwardTournaments(fresh.awardTournaments || []);
  };

  const resetAwardEditors = () => {
    setShowAwardEditor(false);
    setShowHistoricalEditor(false);
    setHistoricalEditingId(null);
    setHistoricalTournamentTitle('');
    setHistoricalTournamentDate('');
    setHistoricalCustomTitle('');
    setHistoricalComment('');
    setAwardComment('');
    setAwardError(null);
  };

  const closeAwardHistory = () => {
    setAwardFilter(null);
    resetAwardEditors();
    setAwardConfirm(null);
  };

  const openAwardHistory = (filter: AwardFilter) => {
    resetAwardEditors();
    setAwardFilter(filter);

    if (filter === 'nominations') {
      setAwardKey('nomination_best_citizen');
      setHistoricalAwardKey('nomination_best_citizen');
    } else {
      setAwardKey(filter);
      setHistoricalAwardKey(filter);
    }

    if (!awardTournamentId && awardTournaments[0]) {
      setAwardTournamentId(awardTournaments[0].id);
    }
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
    setHistoricalAwardKey(
      awardFilter === 'nominations' ? 'nomination_best_citizen' : (awardFilter || 'place_1'),
    );
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
    setAwardError(null);
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

  const executeAwardConfirm = async () => {
    const current = awardConfirm;
    if (!current) return;

    if (current.action === 'suppress') {
      await handleSuppressAward(current.award);
    } else {
      await handleDeleteHistoricalAward(current.award);
    }

    setAwardConfirm(null);
  };

  const awardHistoryTitle = awardFilter === 'place_1'
    ? 'Первые места'
    : awardFilter === 'place_2'
      ? 'Вторые места'
      : awardFilter === 'place_3'
        ? 'Третьи места'
        : 'Номинации';

  const compactAwardTitle = awardHistoryTitle
    .replace('Первые места', '1 место')
    .replace('Вторые места', '2 место')
    .replace('Третьи места', '3 место');

  return (
    <div className="space-y-4 pb-2">
      <section className="rounded-[18px] border border-border-soft bg-surface-1 p-3.5">
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-[13px] bg-surface-2 px-2 py-3">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted">Игры</span>
            <strong className="mt-1 block text-[20px] leading-none text-text-primary">{stats?.totalGames || 0}</strong>
          </div>
          <div className="rounded-[13px] bg-surface-2 px-2 py-3">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted">Победы</span>
            <strong className="mt-1 block text-[20px] leading-none text-success">{stats?.wins || 0}</strong>
          </div>
          <div className="rounded-[13px] bg-surface-2 px-2 py-3">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted">Винрейт</span>
            <strong className="mt-1 block text-[20px] leading-none text-warning">{stats?.winRate || 0}%</strong>
          </div>
          <div className="rounded-[13px] bg-surface-2 px-2 py-3">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted">Вечера</span>
            <strong className="mt-1 block text-[20px] leading-none text-accent">{visits}</strong>
          </div>
        </div>
      </section>

      <section className="rounded-[18px] border border-border-soft bg-surface-1 p-3.5">
        <h3 className="flex items-center gap-2 text-[12px] font-black uppercase tracking-wider text-text-primary">
          <Shield className="h-4 w-4 text-accent" /> Роли
        </h3>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ['❤️', 'Мирный', stats?.roleCounts?.citizen || 0],
            ['⭐', 'Шериф', stats?.roleCounts?.sheriff || 0],
            ['🔫', 'Мафия', stats?.roleCounts?.mafia || 0],
            ['🎩', 'Дон', stats?.roleCounts?.don || 0],
          ].map(([icon, label, count]) => (
            <div key={String(label)} className="rounded-[13px] bg-surface-2 p-2.5 text-center">
              <span className="block text-lg">{icon}</span>
              <strong className="mt-0.5 block text-[15px] text-text-primary">{count}</strong>
              <span className="text-[10px] text-text-muted">{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-[18px] border border-warning/20 bg-surface-1 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-[12px] font-black uppercase tracking-wider text-text-primary">
            <Medal className="h-4 w-4 text-warning" /> Турнирные награды
          </h3>
          <span className="text-[10px] text-text-muted">Нажми для истории</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
              className="min-h-[78px] rounded-[13px] border border-border-soft bg-surface-2 p-2 text-center transition-colors hover:bg-surface-hover active:scale-[0.99]"
            >
              <span className="block text-xl">{item.icon}</span>
              <strong className="block text-[17px] text-text-primary">{item.value}</strong>
              <span className="text-[10px] font-semibold text-text-secondary">{item.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-3 gap-2">
        <div className="rounded-[16px] border border-warning/20 bg-warning-soft p-3 text-center">
          <Trophy className="mx-auto h-5 w-5 text-warning" />
          <strong className="mt-1 block text-lg text-text-primary">{stats?.bestMoves || 0}</strong>
          <span className="text-[10px] font-semibold text-warning">Лучший ход</span>
        </div>
        <div className="rounded-[16px] border border-danger/20 bg-danger-soft p-3 text-center">
          <Skull className="mx-auto h-5 w-5 text-danger" />
          <strong className="mt-1 block text-lg text-text-primary">{stats?.firstKilled || 0}</strong>
          <span className="text-[10px] font-semibold text-danger">ПУ</span>
        </div>
        <div className="rounded-[16px] border border-warning/20 bg-warning-soft p-3 text-center">
          <CircleDot className="mx-auto h-5 w-5 text-warning" />
          <strong className="mt-1 block text-lg text-text-primary">{stats?.zeroRoundVoted || 0}</strong>
          <span className="text-[10px] font-semibold text-warning">0 круг</span>
        </div>
      </section>

      <section className="space-y-3 rounded-[18px] border border-border-soft bg-surface-1 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-[12px] font-black uppercase tracking-wider text-text-primary">
            <Sparkles className="h-4 w-4 text-accent" /> Последние игры
          </h3>
          {allGames.length > 3 && onOpenGames ? (
            <button
              type="button"
              onClick={onOpenGames}
              className="min-h-[44px] shrink-0 rounded-[11px] px-2 text-[11px] font-bold text-accent"
            >
              Все игры →
            </button>
          ) : null}
        </div>

        {recentGames.length ? (
          recentGames.map((game) => <PlayerGameCard key={game.id} game={game} />)
        ) : (
          <div className="rounded-[14px] bg-surface-2 py-8 text-center text-[12px] text-text-secondary">
            Сыгранных протоколов пока нет
          </div>
        )}
      </section>

      <MobileSheet
        open={Boolean(awardFilter)}
        onClose={closeAwardHistory}
        title={(
          <span className="flex items-center gap-2">
            <Award className="h-5 w-5 text-warning" />
            {awardHistoryTitle}
          </span>
        )}
        subtitle="Автоматические результаты, ручные исправления и награды прошлых турниров"
        widthClass="sm:max-w-lg"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            {filteredAwards.length ? filteredAwards.map((award) => (
              <div key={award.id} className="space-y-3 rounded-[16px] border border-border-soft bg-surface-2 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="break-words text-[13px] font-black text-text-primary">{award.title}</div>
                    <div className="mt-0.5 break-words text-[11px] font-bold text-warning">{award.tournament_title}</div>
                    <div className="mt-0.5 text-[11px] text-text-muted">{fmtDate(award.tournament_date)}</div>
                  </div>
                  <span className={`shrink-0 rounded-lg border px-2 py-1 text-[10px] font-black ${
                    award.source === 'historical'
                      ? 'border-warning/30 bg-warning-soft text-warning'
                      : award.source === 'manual'
                        ? 'border-accent/30 bg-accent-soft text-accent'
                        : 'border-success/20 bg-success-soft text-success'
                  }`}>
                    {award.source === 'historical'
                      ? 'ВРУЧНУЮ'
                      : award.source === 'manual'
                        ? 'ПРАВКА'
                        : 'ПО ИТОГАМ'}
                  </span>
                </div>

                {award.comment ? (
                  <div className="rounded-[12px] bg-surface-1 px-3 py-2 text-[11px] leading-4 text-text-secondary">
                    {award.comment}
                  </div>
                ) : null}

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {award.source === 'historical' ? (
                    <>
                      <button
                        type="button"
                        disabled={awardSaving}
                        onClick={() => editHistoricalAward(award)}
                        className="min-h-[44px] rounded-[11px] border border-warning/25 bg-warning-soft px-3 text-[12px] font-bold text-warning disabled:opacity-50"
                      >
                        Изменить
                      </button>
                      <button
                        type="button"
                        disabled={awardSaving}
                        onClick={() => setAwardConfirm({ action: 'deleteHistorical', award })}
                        className="min-h-[44px] rounded-[11px] border border-danger/25 bg-danger-soft px-3 text-[12px] font-bold text-danger disabled:opacity-50"
                      >
                        Удалить
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={awardSaving}
                        onClick={() => setAwardConfirm({ action: 'suppress', award })}
                        className="min-h-[44px] rounded-[11px] border border-danger/25 bg-danger-soft px-3 text-[12px] font-bold text-danger disabled:opacity-50"
                      >
                        Убрать
                      </button>
                      {award.source === 'manual' ? (
                        <button
                          type="button"
                          disabled={awardSaving}
                          onClick={() => void handleResetAward(award)}
                          className="min-h-[44px] rounded-[11px] border border-border-soft bg-surface-1 px-3 text-[12px] font-bold text-text-secondary disabled:opacity-50"
                        >
                          <span className="inline-flex items-center justify-center gap-1.5">
                            <RotateCcw className="h-4 w-4" /> Вернуть расчёт
                          </span>
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            )) : (
              <div className="rounded-[16px] border border-dashed border-border-soft bg-surface-2 py-9 text-center text-[12px] text-text-secondary">
                Таких наград пока нет
              </div>
            )}
          </div>

          {awardError ? (
            <div className="rounded-[14px] border border-danger/30 bg-danger-soft p-3 text-[12px] leading-4 text-danger">
              {awardError}
            </div>
          ) : null}

          {!showAwardEditor && !showHistoricalEditor ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={openHistoricalEditor}
                className="min-h-[48px] rounded-[12px] border border-warning/30 bg-warning-soft px-3 text-[12px] font-black text-warning"
              >
                <span className="inline-flex items-center justify-center gap-2">
                  <Plus className="h-4 w-4" /> Добавить прошлую награду
                </span>
              </button>
              {awardTournaments.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowAwardEditor(true)}
                  className="min-h-[48px] rounded-[12px] border border-accent/30 bg-accent-soft px-3 text-[12px] font-black text-accent"
                >
                  Исправить турнир в базе
                </button>
              ) : null}
            </div>
          ) : null}

          {showHistoricalEditor ? (
            <section className="space-y-4 rounded-[16px] border border-border-soft bg-surface-2 p-3.5">
              <div className="flex items-center justify-between gap-3">
                <strong className="text-[13px] text-text-primary">
                  {historicalEditingId ? 'Изменить прошлую награду' : 'Добавить прошлую награду'}
                </strong>
                <button
                  type="button"
                  onClick={closeHistoricalEditor}
                  disabled={awardSaving}
                  className="min-h-[44px] rounded-[10px] px-3 text-[11px] font-semibold text-text-secondary disabled:opacity-50"
                >
                  Отмена
                </button>
              </div>

              <label className="block">
                <span className="mobile-label">Название турнира</span>
                <input
                  value={historicalTournamentTitle}
                  onChange={(event) => setHistoricalTournamentTitle(event.target.value)}
                  maxLength={180}
                  placeholder="Например: Кубок города 2023"
                  className="mobile-field"
                />
              </label>

              <label className="block">
                <span className="mobile-label">Дата, если известна</span>
                <input
                  type="date"
                  value={historicalTournamentDate}
                  onChange={(event) => setHistoricalTournamentDate(event.target.value)}
                  className="mobile-field"
                />
              </label>

              <div>
                <span className="mobile-label">Награда</span>
                {awardFilter === 'nominations' ? (
                  <select
                    value={historicalAwardKey}
                    onChange={(event) => setHistoricalAwardKey(event.target.value as PlayerAwardKey)}
                    className="mobile-field"
                  >
                    {historicalNominationOptions.map((item) => (
                      <option key={item.key} value={item.key}>{item.label}</option>
                    ))}
                  </select>
                ) : (
                  <div className="min-h-[48px] rounded-[13px] border border-border-soft bg-surface-1 px-3 py-3 text-[12px] font-bold text-warning">
                    {compactAwardTitle}
                  </div>
                )}
              </div>

              {historicalAwardKey === 'nomination_other' ? (
                <label className="block">
                  <span className="mobile-label">Название номинации</span>
                  <input
                    value={historicalCustomTitle}
                    onChange={(event) => setHistoricalCustomTitle(event.target.value)}
                    maxLength={120}
                    placeholder="Например: Лучший дебют"
                    className="mobile-field"
                  />
                </label>
              ) : null}

              <label className="block">
                <span className="mobile-label">Комментарий, необязательно</span>
                <textarea
                  value={historicalComment}
                  onChange={(event) => setHistoricalComment(event.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="Откуда взята информация или уточнение"
                  className="mobile-field resize-none"
                />
              </label>

              <p className="text-[11px] leading-4 text-text-muted">
                Эта запись существует только в профиле игрока и не меняет результаты турниров в базе.
              </p>

              <button
                type="button"
                disabled={awardSaving || !historicalTournamentTitle.trim()}
                onClick={() => void handleSaveHistoricalAward()}
                className="min-h-[48px] w-full rounded-[12px] bg-accent px-4 text-[12px] font-black text-white disabled:opacity-50"
              >
                {awardSaving
                  ? 'Сохранение…'
                  : historicalEditingId
                    ? 'Сохранить изменения'
                    : `Добавить: ${player.nickname}`}
              </button>
            </section>
          ) : null}

          {showAwardEditor ? (
            <section className="space-y-4 rounded-[16px] border border-border-soft bg-surface-2 p-3.5">
              <div className="flex items-center justify-between gap-3">
                <strong className="text-[13px] text-text-primary">Исправить результат турнира в базе</strong>
                <button
                  type="button"
                  onClick={() => {
                    setShowAwardEditor(false);
                    setAwardError(null);
                  }}
                  disabled={awardSaving}
                  className="min-h-[44px] rounded-[10px] px-3 text-[11px] font-semibold text-text-secondary disabled:opacity-50"
                >
                  Отмена
                </button>
              </div>

              <label className="block">
                <span className="mobile-label">Турнир</span>
                <select
                  value={awardTournamentId}
                  onChange={(event) => setAwardTournamentId(event.target.value)}
                  className="mobile-field"
                >
                  <option value="">Выбери турнир</option>
                  {awardTournaments.map((item) => (
                    <option key={item.id} value={item.id}>{item.title} · {fmtDate(item.date)}</option>
                  ))}
                </select>
              </label>

              <div>
                <span className="mobile-label">Награда</span>
                {awardFilter === 'nominations' ? (
                  <select
                    value={awardKey}
                    onChange={(event) => setAwardKey(event.target.value as PlayerAwardKey)}
                    className="mobile-field"
                  >
                    {nominationOptions.map((item) => (
                      <option key={item.key} value={item.key}>{item.label}</option>
                    ))}
                  </select>
                ) : (
                  <div className="min-h-[48px] rounded-[13px] border border-border-soft bg-surface-1 px-3 py-3 text-[12px] font-bold text-accent">
                    {compactAwardTitle}
                  </div>
                )}
              </div>

              <label className="block">
                <span className="mobile-label">Комментарий, необязательно</span>
                <textarea
                  value={awardComment}
                  onChange={(event) => setAwardComment(event.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="Например: решение главного судьи"
                  className="mobile-field resize-none"
                />
              </label>

              <p className="text-[11px] leading-4 text-text-muted">
                Это меняет официальный результат существующего турнира. Для призовых мест система сохраняет уникальные 1–3 места и при необходимости переставляет игроков.
              </p>

              <button
                type="button"
                disabled={awardSaving || !awardTournamentId}
                onClick={() => void handleAssignAward()}
                className="min-h-[48px] w-full rounded-[12px] bg-accent px-4 text-[12px] font-black text-white disabled:opacity-50"
              >
                {awardSaving ? 'Сохранение…' : `Назначить: ${player.nickname}`}
              </button>
            </section>
          ) : null}
        </div>
      </MobileSheet>

      <ConfirmDialog
        open={Boolean(awardConfirm)}
        title={awardConfirm?.action === 'deleteHistorical' ? 'Удалить награду из истории?' : 'Убрать награду?'}
        description={awardConfirm ? `«${awardConfirm.award.title}» · ${awardConfirm.award.tournament_title}` : ''}
        confirmLabel={awardConfirm?.action === 'deleteHistorical' ? 'Удалить' : 'Убрать'}
        tone="danger"
        busy={awardSaving}
        onCancel={() => setAwardConfirm(null)}
        onConfirm={() => void executeAwardConfirm()}
      />
    </div>
  );
};

export default PlayerProfileContent;
