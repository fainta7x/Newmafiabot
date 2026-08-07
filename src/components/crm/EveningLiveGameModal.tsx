import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import LiveGameEngine from '../LiveGameEngine';
import type { GameSlot, Player as LegacyPlayer } from '../../types';
import type { PlayerResultData, TournamentGameProtocolData } from '../../lib/api';
import { clubGamesApi, type ClubGameRecord } from '../../lib/clubGamesApi';

interface EveningLiveGameModalProps {
  game: ClubGameRecord;
  onClose: () => void;
  onUpdated: (game: ClubGameRecord) => void;
}

const roleToProtocol = (role: string | null | undefined): string | null => {
  if (role === 'Мирный' || role === 'citizen') return 'citizen';
  if (role === 'Шериф' || role === 'sheriff') return 'sheriff';
  if (role === 'Мафия' || role === 'mafia') return 'mafia';
  if (role === 'Дон' || role === 'don') return 'don';
  return null;
};

const buildLegacyPlayers = (game: ClubGameRecord): LegacyPlayer[] => {
  const results = (game.club_protocol?.player_results || []).slice().sort((a, b) => a.seat_number - b.seat_number);
  const seated: LegacyPlayer[] = results.map((player, index) => ({
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
  }));

  seated.push({
    id: 10001,
    user_id: 10001,
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

const mapEngineResultToProtocol = (
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

  const bestMoves: NonNullable<TournamentGameProtocolData['best_moves']> = [];
  const confirmedSource = markers.bestMoveSource as 'first_killed' | 'zero_round_voted' | null | undefined;
  const confirmedSourceSlot = Number(markers.bestMoveSourceSlot || 0);
  const confirmedSeats = Array.isArray(markers.bestMoveSeats) ? markers.bestMoveSeats.slice(0, 3) : [];
  const confirmedPlayer = confirmedSourceSlot ? bySeat.get(confirmedSourceSlot) : null;
  if (confirmedSource && confirmedPlayer && confirmedSeats.length > 0) {
    bestMoves.push({ participant_id: confirmedPlayer.participant_id, source: confirmedSource, seat_numbers: confirmedSeats });
  }

  const playerResults = previousResults.map((previous) => {
    const slot = slots.find((candidate) => candidate.slot_num === previous.seat_number) as any;
    if (!slot) return previous;
    return {
      ...previous,
      role: roleToProtocol(slot.role),
      exit_type: slot.exit_reason || (slot.alive ? 'alive' : previous.exit_type),
      regular_fouls: Number(slot.fouls || 0),
      removal_reason: slot.kick && Number(slot.fouls || 0) >= 4 ? '4th_foul' : previous.removal_reason,
      notes: slot.status_reason && !slot.alive ? slot.status_reason : previous.notes,
    } as PlayerResultData;
  });

  const winnerTeam = gameData.winning_team === 'Красные' ? 'red' : 'black';
  const protocol: TournamentGameProtocolData = {
    ...previousProtocol,
    status: 'completed',
    winner_team: winnerTeam,
    end_reason: 'normal',
    first_killed_participant_id: firstKilled?.participant_id || null,
    zero_round_voted_participant_id: zeroRoundVoted?.participant_id || null,
    best_moves: bestMoves,
    best_move_participant_id: bestMoves[0]?.participant_id || null,
    best_move_source: bestMoves[0]?.source || null,
    best_move_seats: bestMoves[0]?.seat_numbers || [],
    judge_notes: [previousProtocol.judge_notes, gameData.protocol_text].filter(Boolean).join('\n') || null,
  };

  return { protocol, player_results: playerResults };
};

const MobileLiveGameStyles = () => (
  <style>{`
    @media (max-width: 767px) {
      .evening-live-engine-shell {
        height: calc(100dvh - 40px);
        overflow-y: auto;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
      }

      .evening-live-engine-shell > div {
        max-width: none !important;
        padding: 2px 3px 6px !important;
      }

      .evening-live-engine-shell > div > div.space-y-4,
      .evening-live-engine-shell > div > div.space-y-6 {
        gap: 3px !important;
      }

      /* Hide the desktop judging toolbar on phone. */
      .evening-live-engine-shell > div > div > div:first-child[class*="bg-slate-900"] {
        display: none !important;
      }

      /* Two columns x five rows. */
      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] {
        gap: 3px !important;
        padding: 0 !important;
      }

      /* Target SeatCard itself, not grid position classes. This keeps all ten seats identical. */
      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > div.relative[class*="aspect-auto"] {
        height: 54px !important;
        min-height: 54px !important;
        max-height: 54px !important;
        padding: 16px 0 0 !important;
        border-radius: 9px !important;
        overflow: hidden !important;
        transform: none !important;
      }

      /* Verbose player-body text is not needed while running a game on a phone. */
      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > div.relative[class*="aspect-auto"] > div.flex-1 {
        display: none !important;
      }

      /* Quick foul/remove buttons stay at the top-right but become smaller. */
      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > div.relative[class*="aspect-auto"] > div.absolute[class*="top-1.5"] {
        top: 1px !important;
        left: 3px !important;
        right: 3px !important;
        height: 14px !important;
      }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > div.relative[class*="aspect-auto"] > div.absolute[class*="top-1.5"] button,
      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > div.relative[class*="aspect-auto"] > div.absolute[class*="top-1.5"] div {
        min-height: 14px !important;
        height: 14px !important;
        line-height: 12px !important;
        font-size: 7px !important;
        padding-top: 0 !important;
        padding-bottom: 0 !important;
      }

      /* Night selection markers (victim / Don / Sheriff) become a small chip instead of a full banner. */
      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > div.relative[class*="aspect-auto"] > div.absolute[class*="top-2.5"] {
        top: 1px !important;
        left: 3px !important;
        right: auto !important;
        width: auto !important;
        max-width: 72px !important;
        z-index: 30 !important;
      }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > div.relative[class*="aspect-auto"] > div.absolute[class*="top-2.5"] span {
        height: 14px !important;
        min-height: 14px !important;
        padding: 0 4px !important;
        font-size: 7px !important;
        line-height: 12px !important;
        gap: 2px !important;
        white-space: nowrap !important;
      }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > div.relative[class*="aspect-auto"] > div.absolute[class*="top-2.5"] svg {
        width: 8px !important;
        height: 8px !important;
      }

      /* Identity strip is the main mobile seat content. */
      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > div.relative[class*="aspect-auto"] > div[class*="min-h-[36px]"] {
        min-height: 28px !important;
        height: 28px !important;
        padding: 1px 4px !important;
        margin-top: auto !important;
      }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > div.relative[class*="aspect-auto"] > div[class*="min-h-[36px]"] span[class*="text-[11px]"] {
        font-size: 10px !important;
        line-height: 11px !important;
      }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > div.relative[class*="aspect-auto"] > div[class*="min-h-[36px]"] span[class*="text-[7.5px]"] {
        display: none !important;
      }

      /* Compact phone HUD. */
      .evening-live-engine-shell div[class*="md:col-start-2"][class*="sticky"] {
        top: 0 !important;
        min-height: 0 !important;
        height: auto !important;
        max-height: 160px !important;
        border-radius: 11px !important;
        padding: 4px !important;
        z-index: 60 !important;
      }

      /* Prev/Next describe night navigation, so duplicate tabs are hidden. */
      .evening-live-engine-shell div[class*="md:col-start-2"][class*="sticky"] > div.flex.flex-wrap {
        display: none !important;
      }

      .evening-live-engine-shell div[class*="md:col-start-2"][class*="sticky"] > div:first-child {
        padding-bottom: 2px !important;
      }

      .evening-live-engine-shell div[class*="md:col-start-2"][class*="sticky"] > div.flex-1 {
        padding-top: 1px !important;
        padding-bottom: 1px !important;
        min-height: 0 !important;
      }

      .evening-live-engine-shell div[class*="md:col-start-2"][class*="sticky"] > div.flex-1 div[class*="text-2xl"],
      .evening-live-engine-shell div[class*="md:col-start-2"][class*="sticky"] > div.flex-1 div[class*="text-3xl"] {
        font-size: 22px !important;
        line-height: 26px !important;
      }

      .evening-live-engine-shell div[class*="md:col-start-2"][class*="sticky"] button[class*="h-9"],
      .evening-live-engine-shell div[class*="md:col-start-2"][class*="sticky"] button[class*="h-10"] {
        height: 29px !important;
      }

      .evening-live-engine-shell div[class*="md:col-start-2"][class*="sticky"] div[class*="min-h-[36px]"] {
        min-height: 29px !important;
      }

      .evening-live-engine-shell div[class*="md:col-start-2"][class*="sticky"] > div:last-child {
        padding-top: 2px !important;
        gap: 2px !important;
      }

      .evening-live-mobile-title-secondary {
        display: none !important;
      }
    }
  `}</style>
);

export const EveningLiveGameModal: React.FC<EveningLiveGameModalProps> = ({ game, onClose, onUpdated }) => {
  const [saving, setSaving] = useState(false);
  const legacyPlayers = useMemo(() => buildLegacyPlayers(game), [game.id]);

  if (!game.club_protocol) return null;

  return (
    <div className="fixed inset-0 z-[95] bg-slate-950 overflow-hidden">
      <MobileLiveGameStyles />

      <div className="h-10 md:h-12 sticky top-0 z-[110] bg-slate-950/95 backdrop-blur border-b border-slate-800 px-2 md:px-3 flex items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-2">
          <div className="text-xs font-black text-white truncate">Игра #{game.global_game_number}</div>
          <div className="evening-live-mobile-title-secondary text-[10px] text-slate-500 truncate">{game.table_name || 'Стол'}{game.judge_name ? ` • ${game.judge_name}` : ''}</div>
        </div>
        <button type="button" onClick={onClose} className="w-8 h-8 md:w-9 md:h-9 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 flex items-center justify-center shrink-0" title="Закрыть движок">
          <X className="w-4 h-4" />
        </button>
      </div>

      {saving && (
        <div className="fixed inset-0 z-[130] bg-slate-950/90 flex items-center justify-center text-sm font-black text-white">
          Сохраняем результат игры…
        </div>
      )}

      <div className="evening-live-engine-shell py-0.5 md:py-3">
        <LiveGameEngine
          players={legacyPlayers}
          initialJudgeId={10001}
          onCancel={onClose}
          onGameFinished={async (gameData) => {
            setSaving(true);
            try {
              const next = mapEngineResultToProtocol(game, gameData);
              const updated = await clubGamesApi.saveProtocol(game.id, next);
              onUpdated(updated);
              onClose();
            } catch (err: any) {
              alert(err.message || 'Не удалось сохранить результат проведённой игры');
            } finally {
              setSaving(false);
            }
          }}
        />
      </div>
    </div>
  );
};