import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, X } from 'lucide-react';
import LiveGameEngine from '../LiveGameEngine';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import type { GameSlot, Player as LegacyPlayer } from '../../types';
import type { PlayerResultData, TournamentGameProtocolData } from '../../lib/api';
import { clubGamesApi, getPendingClubGameProtocolSave, type ClubGameRecord } from '../../lib/clubGamesApi';
import { applyStoredDeathProtocolsToResults, clearStoredDeathProtocols } from '../../lib/liveDeathProtocol';
import { ClubLiveSessionRecorder } from '../../lib/liveClubSession';

interface EveningLiveGameModalProps {
  game: ClubGameRecord;
  onClose: () => void;
  onUpdated: (game: ClubGameRecord) => void;
}

type LiveVisualDiscipline = {
  fouls: number;
  minorTech: number;
  majorTech: number;
  alive: boolean;
};

const roleToProtocol = (role: string | null | undefined): string | null => {
  if (role === 'Мирный' || role === 'citizen') return 'citizen';
  if (role === 'Шериф' || role === 'sheriff') return 'sheriff';
  if (role === 'Мафия' || role === 'mafia') return 'mafia';
  if (role === 'Дон' || role === 'don') return 'don';
  return null;
};

/**
 * LiveGameEngine still declares its legacy identity as a number, but the club
 * branch only compares/serializes that value. Keep the unsafe cast at this
 * single compatibility boundary so the runtime identity is the real CRM UUID.
 */
const asLegacyIdentity = (value: string): number => value as unknown as number;

const getClubJudgeIdentity = (game: ClubGameRecord): number =>
  asLegacyIdentity(game.judge_player_id || `legacy-judge:${game.id}`);

const buildLegacyPlayers = (game: ClubGameRecord): LegacyPlayer[] => {
  const results = (game.club_protocol?.player_results || []).slice().sort((a, b) => a.seat_number - b.seat_number);
  const seated: LegacyPlayer[] = results.map((player) => {
    const identity = player.player_id || `legacy-participant:${player.participant_id}`;
    return {
      id: asLegacyIdentity(identity),
      user_id: asLegacyIdentity(identity),
      nickname: player.display_name,
      full_name: player.display_name,
      username: '',
      games_played: 0,
      games_won: 0,
      elo: 0,
      debt: 0,
      total_paid: 0,
      tokens: 0,
      achievements: [],
      last_visit: null,
    };
  });

  const judgeIdentity = getClubJudgeIdentity(game);
  seated.push({
    id: judgeIdentity,
    user_id: judgeIdentity,
    nickname: game.judge_name || 'Ведущий',
    full_name: game.judge_name || 'Ведущий',
    username: '',
    games_played: 0,
    games_won: 0,
    elo: 0,
    debt: 0,
    total_paid: 0,
    tokens: 0,
    achievements: [],
    last_visit: null,
    notes: '__club_evening_engine_judge__',
  });

  return seated;
};

export const mapEngineResultToProtocol = (
  game: ClubGameRecord,
  gameData: any,
): { protocol: TournamentGameProtocolData; player_results: PlayerResultData[] } => {
  if (!game.club_protocol) throw new Error('У игры отсутствует клубный протокол');

  const previousProtocol = game.club_protocol.protocol;
  const previousResults = game.club_protocol.player_results;
  const bySeat = new Map(previousResults.map((player) => [player.seat_number, player]));
  const slots: GameSlot[] = Array.isArray(gameData.slots) ? gameData.slots : [];
  const markers = gameData.protocol_markers || {};

  const firstKilled = markers.firstKilledSlot ? bySeat.get(Number(markers.firstKilledSlot)) : null;
  const zeroRoundVoted = markers.zeroRoundVotedSlot ? bySeat.get(Number(markers.zeroRoundVotedSlot)) : null;
  const ppkSlot = Number((slots as any[]).find((slot) => Boolean(slot?.ppk))?.slot_num || 0);
  const ppkPlayer = ppkSlot ? bySeat.get(ppkSlot) : null;

  const bestMoves: NonNullable<TournamentGameProtocolData['best_moves']> = [];
  const confirmedSource = markers.bestMoveSource as 'first_killed' | 'zero_round_voted' | null | undefined;
  const confirmedSourceSlot = Number(markers.bestMoveSourceSlot || 0);
  const confirmedSeats = Array.isArray(markers.bestMoveSeats) ? markers.bestMoveSeats.slice(0, 3) : [];
  const confirmedPlayer = confirmedSourceSlot ? bySeat.get(confirmedSourceSlot) : null;
  if (confirmedSource && confirmedPlayer && confirmedSeats.length > 0) {
    bestMoves.push({
      participant_id: confirmedPlayer.participant_id,
      source: confirmedSource,
      seat_numbers: confirmedSeats,
    });
  }

  const playerResults = applyStoredDeathProtocolsToResults(previousResults.map((previous) => {
    const slot = (
      slots.find((candidate) => String((candidate as any).user_id || '') === previous.player_id)
      || slots.find((candidate) => candidate.slot_num === previous.seat_number)
    ) as any;
    if (!slot) return previous;
    const minorTechnical = Number(slot.minor_tech_fouls || 0);
    const majorTechnical = Number(slot.major_tech_fouls || 0);
    return {
      ...previous,
      role: roleToProtocol(slot.role),
      exit_type: slot.exit_reason || (slot.alive ? 'alive' : previous.exit_type),
      regular_fouls: Number(slot.fouls || 0),
      minor_technical_fouls: minorTechnical,
      major_technical_fouls: majorTechnical,
      technical_fouls: minorTechnical + majorTechnical,
      removal_reason: slot.removal_reason || (slot.kick && Number(slot.fouls || 0) >= 4 ? '4th_foul' : previous.removal_reason),
      ppk: Boolean(slot.ppk),
      notes: slot.status_reason && !slot.alive ? slot.status_reason : previous.notes,
    } as PlayerResultData;
  }));

  const winnerTeam = gameData.winning_team === 'Красные' ? 'red' : 'black';
  const protocol: TournamentGameProtocolData = {
    ...previousProtocol,
    status: 'completed',
    winner_team: winnerTeam,
    end_reason: (gameData.end_reason || 'normal') as any,
    ppk_culprit_participant_id: ppkPlayer?.participant_id || previousProtocol.ppk_culprit_participant_id || null,
    first_killed_participant_id: firstKilled?.participant_id || null,
    zero_round_voted_participant_id: zeroRoundVoted?.participant_id || null,
    best_moves: bestMoves.length ? bestMoves : (previousProtocol.best_moves || []),
    best_move_participant_id: bestMoves[0]?.participant_id || previousProtocol.best_move_participant_id || null,
    best_move_source: bestMoves[0]?.source || previousProtocol.best_move_source || null,
    best_move_seats: bestMoves[0]?.seat_numbers || previousProtocol.best_move_seats || [],
    votes: Array.isArray(gameData.votes) ? gameData.votes : (previousProtocol.votes || []),
    shots: Array.isArray(gameData.shots) ? gameData.shots : (previousProtocol.shots || []),
    judge_notes: [previousProtocol.judge_notes, gameData.protocol_text].filter(Boolean).join('\n') || null,
  };

  return { protocol, player_results: playerResults };
};

const seatPlacement: Record<number, React.CSSProperties> = {
  9: { gridColumn: 1, gridRow: 1 },
  10: { gridColumn: 2, gridRow: 1 },
  1: { gridColumn: 3, gridRow: 1 },
  2: { gridColumn: 4, gridRow: 1 },
  8: { gridColumn: 1, gridRow: 2 },
  3: { gridColumn: 4, gridRow: 2 },
  7: { gridColumn: 1, gridRow: 3 },
  6: { gridColumn: 2, gridRow: 3 },
  5: { gridColumn: 3, gridRow: 3 },
  4: { gridColumn: 4, gridRow: 3 },
};

export const EveningLiveGameModal: React.FC<EveningLiveGameModalProps> = ({ game, onClose, onUpdated }) => {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(() =>
    getPendingClubGameProtocolSave(game.id)
      ? 'Предыдущая попытка сохранить завершённую игру не дошла до сервера.'
      : null,
  );
  const [livePhase, setLivePhase] = useState('setup');
  const [rolesHidden, setRolesHidden] = useState(false);
  const [liveDiscipline, setLiveDiscipline] = useState<Record<number, LiveVisualDiscipline>>({});
  const legacyPlayers = useMemo(() => buildLegacyPlayers(game), [game]);
  const livePlayers = useMemo(
    () => (game.club_protocol?.player_results || []).slice().sort((a, b) => a.seat_number - b.seat_number),
    [game],
  );
  const liveRecorder = useMemo(() => new ClubLiveSessionRecorder(game.id), [game.id]);

  useLayoutEffect(() => {
    liveRecorder.mount();
    return () => liveRecorder.unmount();
  }, [liveRecorder]);

  useEffect(() => {
    const originalConfirm = window.confirm;
    window.confirm = (message?: string) => {
      const text = String(message || '');
      const isDisciplineAction =
        text.includes('Удалить игрока') ||
        text.includes('ППК') ||
        text.includes('4-й фол') ||
        text.includes('второй технический фол');
      if (isDisciplineAction) return true;
      return originalConfirm.call(window, text);
    };

    return () => {
      window.confirm = originalConfirm;
    };
  }, []);

  useEffect(() => {
    if (livePhase === 'setup') {
      setLiveDiscipline({});
      return;
    }

    let lastSignature = '';
    const syncFromLiveSession = () => {
      try {
        liveRecorder.sync();
        const raw = localStorage.getItem('mafia_live_session');
        if (!raw) return;
        const parsed = JSON.parse(raw);
        const activePlayers = Array.isArray(parsed?.activePlayers) ? parsed.activePlayers : [];
        const next: Record<number, LiveVisualDiscipline> = {};
        for (const player of activePlayers) {
          const slot = Number(player?.slot_num);
          if (!Number.isInteger(slot) || slot < 1 || slot > 10) continue;
          next[slot] = {
            fouls: Number(player?.fouls || 0),
            minorTech: Number(player?.minor_tech_fouls || 0),
            majorTech: Number(player?.major_tech_fouls || 0),
            alive: player?.alive !== false,
          };
        }
        const signature = JSON.stringify(next);
        if (signature !== lastSignature) {
          lastSignature = signature;
          setLiveDiscipline(next);
        }
      } catch {}
    };

    syncFromLiveSession();
    const intervalId = window.setInterval(syncFromLiveSession, 300);
    return () => window.clearInterval(intervalId);
  }, [livePhase, liveRecorder]);

  const finishConfirmedSave = (updated: ClubGameRecord) => {
    liveRecorder.finish();
    clearStoredDeathProtocols();
    setSaveError(null);
    onUpdated(updated);
    onClose();
  };

  const retryFinalSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const updated = await clubGamesApi.retryPendingProtocolSave(game.id);
      if (!updated) throw new Error('Локальная копия завершённого протокола не найдена');
      finishConfirmedSave(updated);
    } catch (err: any) {
      setSaveError(err?.message || 'Не удалось повторно сохранить результат. Локальная копия сохранена на устройстве.');
    } finally {
      setSaving(false);
    }
  };

  if (!game.club_protocol) return null;

  return (
    <div className={`fixed inset-0 z-[95] bg-slate-950 overflow-hidden ${rolesHidden ? 'evening-live-roles-hidden' : ''}`}>
      <div className="h-[34px] md:h-12 sticky top-0 z-[110] bg-slate-950/95 backdrop-blur border-b border-slate-800 px-2 md:px-3 flex items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-2">
          <div className="text-[11px] md:text-xs font-black text-white truncate">Игра #{game.global_game_number}</div>
          <div className="evening-live-mobile-title-secondary text-[10px] text-slate-500 truncate">
            {game.table_name || 'Стол'}{game.judge_name ? ` • ${game.judge_name}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setRolesHidden((value) => !value)}
            className={`w-7 h-7 md:w-9 md:h-9 rounded-lg md:rounded-xl border flex items-center justify-center shrink-0 ${rolesHidden ? 'bg-amber-950/70 border-amber-700 text-amber-300' : 'bg-slate-900 border-slate-800 text-slate-400'}`}
            title={rolesHidden ? 'Показать роли' : 'Скрыть роли'}
          >
            {rolesHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 md:w-9 md:h-9 rounded-lg md:rounded-xl bg-slate-900 border border-slate-800 text-slate-400 flex items-center justify-center shrink-0"
            title="Закрыть движок"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {saving && (
        <div className="fixed inset-0 z-[130] bg-slate-950/90 flex items-center justify-center text-sm font-black text-white">
          Сохраняем результат игры…
        </div>
      )}

      {!saving && saveError && (
        <div className="fixed inset-0 z-[130] bg-slate-950/95 px-5 flex items-center justify-center">
          <div className="w-full max-w-sm rounded-2xl border border-rose-900/80 bg-slate-900 p-5 shadow-2xl">
            <div className="text-base font-black text-white">Результат ещё не подтверждён сервером</div>
            <div className="mt-2 text-sm leading-5 text-slate-300">{saveError}</div>
            <div className="mt-2 text-xs leading-4 text-slate-500">
              Финальный протокол сохранён локально. Повтор отправляет ту же самую завершённую игру — проводить её заново не нужно.
            </div>
            <button
              type="button"
              onClick={retryFinalSave}
              className="mt-4 w-full min-h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black"
            >
              Повторить сохранение
            </button>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 w-full min-h-10 rounded-xl border border-slate-700 bg-slate-950 text-slate-300 text-sm font-bold"
            >
              Закрыть — локальная копия останется
            </button>
          </div>
        </div>
      )}

      <div className="evening-live-engine-shell py-0.5 md:py-3">
        <LiveGameEngine
          players={legacyPlayers}
          initialJudgeId={getClubJudgeIdentity(game)}
          onCancel={onClose}
          onPhaseChange={setLivePhase}
          onGameFinished={async (gameData) => {
            setSaving(true);
            setSaveError(null);
            try {
              const evidence = liveRecorder.getEvidence();
              const next = mapEngineResultToProtocol(game, { ...gameData, votes: evidence.votes, shots: evidence.shots });
              const updated = await clubGamesApi.saveProtocol(game.id, next);
              finishConfirmedSave(updated);
            } catch (err: any) {
              setSaveError(err?.message || 'Не удалось сохранить результат проведённой игры. Локальная копия сохранена на устройстве.');
            } finally {
              setSaving(false);
            }
          }}
        />

        {livePhase !== 'setup' && (
          <div className="evening-live-identity-layer" aria-hidden="true">
            {livePlayers.map((player) => {
              const current = liveDiscipline[player.seat_number];
              const fouls = current?.fouls ?? Number((player as any).regular_fouls || 0);
              const minorTech = current?.minorTech ?? Number((player as any).minor_technical_fouls || 0);
              const majorTech = current?.majorTech ?? Number((player as any).major_technical_fouls || 0);
              const alive = current?.alive ?? true;
              return (
                <div
                  key={player.seat_number}
                  className="evening-live-identity"
                  style={seatPlacement[player.seat_number]}
                  data-seat={player.seat_number}
                  data-alive={alive ? 'true' : 'false'}
                >
                  <PlayerAvatar
                    playerId={player.player_id}
                    nickname={player.display_name}
                    size="xl"
                    forceStoredLookup
                    className="evening-live-player-avatar"
                  />
                  <span className="evening-live-identity-name">{player.display_name}</span>
                  <div className="evening-live-discipline" aria-label={`Фолы ${fouls}, малые техфолы ${minorTech}, большие техфолы ${majorTech}`}>
                    <span className="evening-live-discipline-foul">✓{fouls}</span>
                    <span className="evening-live-discipline-minor">!{minorTech}</span>
                    <span className="evening-live-discipline-major">!{majorTech}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};