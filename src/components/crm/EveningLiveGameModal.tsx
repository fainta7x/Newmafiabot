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
        padding: 3px !important;
        padding-bottom: 12px !important;
      }

      .evening-live-engine-shell > div > div.space-y-4,
      .evening-live-engine-shell > div > div.space-y-6 {
        gap: 4px !important;
      }

      /* The full desktop judging toolbar is intentionally hidden on phone. */
      .evening-live-engine-shell > div > div > div:first-child[class*="bg-slate-900"] {
        display: none !important;
      }

      /* Restore the original table geometry on phone: 5 players, center HUD, 5 players. */
      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] {
        display: grid !important;
        grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
        grid-template-rows: 68px minmax(150px, auto) 68px !important;
        gap: 3px !important;
        padding: 0 !important;
        align-items: stretch !important;
      }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(1) { grid-column: 1; grid-row: 3; }
      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(2) { grid-column: 2; grid-row: 3; }
      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(3) { grid-column: 3; grid-row: 3; }
      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(4) { grid-column: 4; grid-row: 3; }
      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(5) { grid-column: 5; grid-row: 3; }
      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(6) { grid-column: 5; grid-row: 1; }
      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(7) { grid-column: 4; grid-row: 1; }
      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(8) { grid-column: 3; grid-row: 1; }
      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(9) { grid-column: 2; grid-row: 1; }
      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(10) { grid-column: 1; grid-row: 1; }

      /* All ten player cards use exactly the same compact geometry. */
      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(-n+10) {
        width: 100% !important;
        height: 68px !important;
        min-height: 68px !important;
        max-height: 68px !important;
        padding: 19px 1px 0 !important;
        border-radius: 10px !important;
        transform: none !important;
        overflow: hidden !important;
      }

      /* Remove the verbose card body; number/name/role and quick actions remain. */
      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(-n+10) > div.flex-1 {
        display: none !important;
      }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(-n+10) div[class*="min-h-[36px]"] {
        min-height: 28px !important;
        height: 28px !important;
        padding: 1px 2px !important;
        gap: 0 !important;
      }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(-n+10) [title="Выставить на голосование"] span,
      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(-n+10) [title="Снять с голосования"] span {
        display: none !important;
      }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(-n+10) button {
        min-width: 16px !important;
        max-height: 19px !important;
        padding: 1px 3px !important;
        font-size: 8px !important;
      }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(-n+10) span[class*="font-black"][class*="truncate"] {
        font-size: 8px !important;
        line-height: 9px !important;
      }

      /* The center panel is the middle of the table, never a sticky overlay. */
      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(11) {
        grid-column: 1 / span 5 !important;
        grid-row: 2 !important;
        order: 0 !important;
        position: relative !important;
        top: auto !important;
        z-index: 20 !important;
        width: 100% !important;
        min-height: 150px !important;
        max-height: 190px !important;
        padding: 6px !important;
        border-radius: 14px !important;
      }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(11) > div.flex.flex-wrap {
        display: none !important;
      }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(11) > div.flex-1 {
        padding-top: 2px !important;
        padding-bottom: 2px !important;
        min-height: 0 !important;
      }

      .evening-live-mobile-title-secondary { display: none !important; }
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