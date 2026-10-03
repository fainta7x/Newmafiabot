import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, X } from 'lucide-react';
import LiveGameEngine from '../LiveGameEngine.tsx';
import { GameProtocolModal } from '../crm/tournaments/GameProtocolModal.tsx';
import type { Player as LegacyPlayer, GameSlot } from '../../types.ts';
import type { PlayerResultData, TournamentGameProtocolData } from '../../lib/api.ts';
import {
  buildLiveBroadcastState,
  mergeBroadcastDayVotes,
  type LiveBroadcastDayVote,
} from '../../lib/liveBroadcast.ts';
import { readStoredDeathProtocols } from '../../lib/liveDeathProtocol.ts';

const roleToProtocol = (role: string | null | undefined): string | null => {
  if (role === 'Мирный' || role === 'citizen') return 'citizen';
  if (role === 'Шериф' || role === 'sheriff') return 'sheriff';
  if (role === 'Мафия' || role === 'mafia') return 'mafia';
  if (role === 'Дон' || role === 'don') return 'don';
  return null;
};

const buildLegacyPlayers = (results: PlayerResultData[], judgeName: string | null | undefined): LegacyPlayer[] => {
  const players: LegacyPlayer[] = results.slice().sort((a, b) => a.seat_number - b.seat_number).map((player, index) => ({
    id: index + 1,
    user_id: index + 1,
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
    notes: `__tournament_role__:${player.role || ''}`,
  }));
  players.push({
    id: 10001,
    user_id: 10001,
    nickname: judgeName || 'Судья',
    full_name: judgeName || 'Судья',
    username: '',
    games_played: 0,
    games_won: 0,
    elo: 0,
    debt: 0,
    total_paid: 0,
    tokens: 0,
    achievements: [],
    last_visit: null,
    notes: '__tournament_engine_judge__',
  });
  return players;
};

const mapEngineResult = (
  previousProtocol: TournamentGameProtocolData,
  previousResults: PlayerResultData[],
  gameData: any,
) => {
  const bySeat = new Map(previousResults.map((player) => [Number(player.seat_number), player]));
  const slots: GameSlot[] = Array.isArray(gameData?.slots) ? gameData.slots : [];
  const markers = gameData?.protocol_markers || {};

  const firstKilled = markers.firstKilledSlot ? bySeat.get(Number(markers.firstKilledSlot)) : null;
  const zeroRoundVoted = markers.zeroRoundVotedSlot ? bySeat.get(Number(markers.zeroRoundVotedSlot)) : null;
  const ppkSlot = slots.find((slot: any) => Boolean(slot?.ppk))?.slot_num || null;
  const ppkPlayer = ppkSlot ? bySeat.get(Number(ppkSlot)) : null;

  const bestMoves: NonNullable<TournamentGameProtocolData['best_moves']> = [];
  const source = markers.bestMoveSource as 'first_killed' | 'zero_round_voted' | null | undefined;
  const sourceSlot = Number(markers.bestMoveSourceSlot || 0);
  const sourcePlayer = sourceSlot ? bySeat.get(sourceSlot) : null;
  const bestMoveSeats = Array.isArray(markers.bestMoveSeats) ? markers.bestMoveSeats.slice(0, 3) : [];
  if (source && sourcePlayer && bestMoveSeats.length) {
    bestMoves.push({ participant_id: sourcePlayer.participant_id, source, seat_numbers: bestMoveSeats });
  }

  const playerResults = previousResults.map((previous) => {
    const slot: any = slots.find((candidate: any) => Number(candidate.slot_num) === Number(previous.seat_number));
    if (!slot) return previous;
    return {
      ...previous,
      role: previous.role || roleToProtocol(slot.role),
      exit_type: slot.exit_reason || (slot.alive ? 'alive' : previous.exit_type),
      regular_fouls: Number(slot.fouls || 0),
      minor_technical_fouls: Number(slot.minor_tech_fouls || 0),
      major_technical_fouls: Number(slot.major_tech_fouls || 0),
      technical_fouls: Number(slot.minor_tech_fouls || 0) + Number(slot.major_tech_fouls || 0),
      removal_reason: slot.removal_reason || previous.removal_reason || null,
      notes: slot.status_reason && !slot.alive ? slot.status_reason : previous.notes,
    } as PlayerResultData;
  });

  const protocol: TournamentGameProtocolData = {
    ...previousProtocol,
    status: 'draft',
    winner_team: gameData?.winning_team === 'Красные' ? 'red' : 'black',
    end_reason: (gameData?.end_reason || 'normal') as any,
    ppk_culprit_participant_id: gameData?.end_reason === 'ppk' ? (ppkPlayer?.participant_id || null) : null,
    first_killed_participant_id: firstKilled?.participant_id || null,
    zero_round_voted_participant_id: zeroRoundVoted?.participant_id || null,
    best_moves: bestMoves,
    best_move_participant_id: bestMoves[0]?.participant_id || null,
    best_move_source: bestMoves[0]?.source || null,
    best_move_seats: bestMoves[0]?.seat_numbers || [],
    judge_notes: [previousProtocol.judge_notes, gameData?.protocol_text, 'Живое ведение завершено. Проверьте журнал голосований/ночей перед финальным подтверждением.'].filter(Boolean).join('\n') || null,
  };

  return { protocol, player_results: playerResults };
};

type TournamentLivePayload = {
  protocol: TournamentGameProtocolData;
  player_results: PlayerResultData[];
  game: { game_number?: number | null } | null;
};

export default function TournamentLiveGameModal({
  tournamentId,
  gameId,
  judgeName,
  onClose,
  onCompleted,
}: {
  tournamentId: string;
  gameId: string;
  judgeName?: string | null;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [payload, setPayload] = useState<TournamentLivePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rolesHidden, setRolesHidden] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [livePhase, setLivePhase] = useState<string>('setup');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/tournaments/${encodeURIComponent(tournamentId)}/games/${encodeURIComponent(gameId)}/protocol`, { credentials: 'include' });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить турнирный протокол');
        if (!cancelled) setPayload({ protocol: body.protocol, player_results: body.player_results || [], game: body.game || null });
      } catch (loadError: any) {
        if (!cancelled) setError(loadError?.message || 'Не удалось загрузить игру');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tournamentId, gameId]);

  useEffect(() => {
    if (!payload || livePhase === 'setup' || reviewMode) return;

    const gameNumber = Math.max(1, Number(payload.game?.game_number || 1));
    const metadata = {
      gameId: gameNumber,
      globalGameNumber: gameNumber,
      eveningGameNumber: gameNumber,
      tableName: 'Турнир',
      players: payload.player_results.map((player) => ({
        seat: Number(player.seat_number),
        playerId: null,
        nickname: player.display_name || `Игрок ${player.seat_number}`,
      })),
    };
    const votesKey = `mafia_live_broadcast_votes:tournament:${tournamentId}:${gameId}`;
    let disposed = false;
    let inFlight = false;
    let lastSentSignature = '';
    let lastSuccessfulAt = 0;

    const syncBroadcast = async () => {
      if (disposed || inFlight) return;
      try {
        const raw = localStorage.getItem('mafia_live_session');
        if (!raw) return;
        const built = buildLiveBroadcastState(JSON.parse(raw), metadata);
        if (!built) return;

        let storedVotes: LiveBroadcastDayVote[] = [];
        try {
          const rawVotes = JSON.parse(localStorage.getItem(votesKey) || '[]');
          if (Array.isArray(rawVotes)) storedVotes = rawVotes;
        } catch {}
        const dayVotes = mergeBroadcastDayVotes(storedVotes, built);
        if (JSON.stringify(dayVotes) !== JSON.stringify(storedVotes)) {
          try { localStorage.setItem(votesKey, JSON.stringify(dayVotes)); } catch {}
        }
        const protocols = Object.entries(readStoredDeathProtocols()).map(([seat, protocol]) => ({
          seat: Number(seat),
          red: protocol.red,
          black: protocol.black,
          sheriff: protocol.sheriff,
        }));
        const state = { ...built, dayVotes, protocols };
        const signature = JSON.stringify(state);
        const now = Date.now();
        if (signature === lastSentSignature && now - lastSuccessfulAt < 5_000) return;

        inFlight = true;
        const response = await fetch(`/api/games/tournament/${encodeURIComponent(tournamentId)}/${encodeURIComponent(gameId)}/broadcast-state`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state }),
        });
        if (!response.ok) throw new Error('Tournament broadcast state rejected');
        lastSentSignature = signature;
        lastSuccessfulAt = now;
      } catch {
        lastSentSignature = '';
      } finally {
        inFlight = false;
      }
    };

    void syncBroadcast();
    const interval = window.setInterval(() => { void syncBroadcast(); }, 650);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [payload, tournamentId, gameId, livePhase, reviewMode]);

  const legacyPlayers = useMemo(() => payload ? buildLegacyPlayers(payload.player_results, judgeName) : [], [payload, judgeName]);

  if (reviewMode) {
    return (
      <GameProtocolModal
        tournamentId={tournamentId}
        gameId={gameId}
        isOpen={true}
        onClose={onClose}
        onProtocolUpdated={() => {
          onCompleted();
          onClose();
        }}
      />
    );
  }

  return (
    <div className={`fixed inset-0 z-[96] overflow-hidden bg-slate-950 ${rolesHidden ? 'tournament-live-roles-hidden' : ''}`}>
      <style>{`
        @media (max-width: 767px) {
          .tournament-live-shell { height: calc(100dvh - 38px); overflow-y: auto; overscroll-behavior: contain; }
          .tournament-live-shell > div { max-width: none !important; padding: 3px !important; }
        }
        @media (min-width: 768px) {
          .tournament-live-shell .live-judge-hud__body:has(> .live-judge-hud__stack--voting-scroll > .live-judge-vote-summary) {
            align-items: stretch !important;
            overflow: hidden !important;
            padding: 3px 5px !important;
          }
          .tournament-live-shell .live-judge-hud__stack--voting-scroll:has(> .live-judge-vote-summary) {
            height: 100% !important;
            max-height: 100% !important;
            gap: 3px !important;
            justify-content: flex-start !important;
          }
          .tournament-live-shell .live-judge-hud__stack--voting-scroll:has(> .live-judge-vote-summary) > .live-judge-voting-order {
            padding: 3px 4px !important;
            gap: 4px !important;
            border-radius: 8px !important;
          }
          .tournament-live-shell .live-judge-hud__stack--voting-scroll:has(> .live-judge-vote-summary) .live-judge-voting-order__seat {
            min-width: 26px !important;
            height: 21px !important;
            font-size: 8px !important;
          }
          .tournament-live-shell .live-judge-hud__stack--voting-scroll:has(> .live-judge-vote-summary) > .live-judge-hud__title {
            font-size: 11px !important;
            line-height: 1 !important;
          }
          .tournament-live-shell .live-judge-hud__stack--voting-scroll:has(> .live-judge-vote-summary) .live-judge-stat {
            padding: 3px 5px !important;
          }
          .tournament-live-shell .live-judge-hud__stack--voting-scroll:has(> .live-judge-vote-summary) .live-judge-voter-state,
          .tournament-live-shell .live-judge-hud__stack--voting-scroll:has(> .live-judge-vote-summary) > .live-judge-hud__hint {
            max-height: 12px !important;
            overflow: hidden !important;
            white-space: nowrap !important;
            text-overflow: ellipsis !important;
            font-size: 7px !important;
            line-height: 1 !important;
          }
          .tournament-live-shell .live-judge-hud__stack--voting-scroll:has(> .live-judge-vote-summary) > .live-judge-vote-actions {
            display: flex !important;
            visibility: visible !important;
            opacity: 1 !important;
            flex: 0 0 auto !important;
            margin-top: auto !important;
            padding-top: 2px !important;
          }
          .tournament-live-shell .live-judge-hud__stack--voting-scroll:has(> .live-judge-vote-summary) > .live-judge-vote-actions .live-judge-action {
            min-height: 30px !important;
            flex-shrink: 0 !important;
            font-size: 9px !important;
          }
        }
        .tournament-live-roles-hidden .tournament-live-shell [title="Красный"],
        .tournament-live-roles-hidden .tournament-live-shell [title="Дон"],
        .tournament-live-roles-hidden .tournament-live-shell [title="Мафия"],
        .tournament-live-roles-hidden .tournament-live-shell [title="Шериф"] { opacity: 0 !important; }
      `}</style>
      <div className="flex h-[38px] items-center justify-between gap-2 border-b border-slate-800 bg-slate-950/95 px-2">
        <div className="truncate text-xs font-black text-white">Турнир · живое ведение</div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setRolesHidden((value) => !value)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-400" title={rolesHidden ? 'Показать роли' : 'Скрыть роли'}>{rolesHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-400" title="Закрыть"><X className="h-4 w-4" /></button>
        </div>
      </div>

      {loading ? <div className="flex h-[70vh] items-center justify-center text-sm text-slate-400">Загрузка игры…</div> : null}
      {error ? <div className="m-4 rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div> : null}
      {saving ? <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/90 text-sm font-black text-white">Переносим результат в протокол…</div> : null}

      {payload && !loading ? (
        <div className="tournament-live-shell evening-live-engine-shell">
          <LiveGameEngine
            players={legacyPlayers}
            initialJudgeId={10001}
            onCancel={onClose}
            onPhaseChange={setLivePhase}
            rolesHidden={rolesHidden}
            onRolesHiddenChange={setRolesHidden}
            onGameFinished={async (gameData) => {
              setSaving(true);
              setError(null);
              try {
                const next = mapEngineResult(payload.protocol, payload.player_results, gameData);
                const response = await fetch(`/api/tournaments/${encodeURIComponent(tournamentId)}/games/${encodeURIComponent(gameId)}/protocol`, {
                  method: 'PUT',
                  credentials: 'include',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(next),
                });
                const body = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(body?.error || 'Не удалось перенести результат в турнирный протокол');
                setReviewMode(true);
              } catch (saveError: any) {
                setError(saveError?.message || 'Не удалось сохранить результат игры');
              } finally {
                setSaving(false);
              }
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
