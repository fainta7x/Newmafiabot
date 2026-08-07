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

  // LiveGameEngine historically requires a numeric judge id from the same Player[] list.
  // The club evening stores a free-form judge name, so a non-persisted synthetic judge is added
  // after the 10 seated players. It is never saved into CRM/player data.
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
  const firstKilledSlotResult = slots.find((slot) => slot.slot_num === Number(markers.firstKilledSlot));
  const zeroRoundSlotResult = slots.find((slot) => slot.slot_num === Number(markers.zeroRoundVotedSlot));

  const firstGuesses = ((firstKilledSlotResult as any)?.best_move_guesses || []) as number[];
  if (firstKilled && firstGuesses.length > 0) {
    bestMoves.push({ participant_id: firstKilled.participant_id, source: 'first_killed', seat_numbers: firstGuesses.slice(0, 3) });
  }
  const zeroGuesses = ((zeroRoundSlotResult as any)?.best_move_guesses || []) as number[];
  if (zeroRoundVoted && zeroGuesses.length > 0) {
    bestMoves.push({ participant_id: zeroRoundVoted.participant_id, source: 'zero_round_voted', seat_numbers: zeroGuesses.slice(0, 3) });
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

export const EveningLiveGameModal: React.FC<EveningLiveGameModalProps> = ({ game, onClose, onUpdated }) => {
  const [saving, setSaving] = useState(false);
  const legacyPlayers = useMemo(() => buildLegacyPlayers(game), [game.id]);

  if (!game.club_protocol) return null;

  return (
    <div className="fixed inset-0 z-[95] bg-slate-950 overflow-y-auto">
      <div className="sticky top-0 z-[110] bg-slate-950/95 backdrop-blur border-b border-slate-800 px-3 py-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-black text-white truncate">Проведение игры #{game.global_game_number}</div>
          <div className="text-[10px] text-slate-500 truncate">{game.table_name || 'Стол'}{game.judge_name ? ` • ${game.judge_name}` : ''}</div>
        </div>
        <button type="button" onClick={onClose} className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 flex items-center justify-center" title="Закрыть движок">
          <X className="w-4 h-4" />
        </button>
      </div>

      {saving && (
        <div className="fixed inset-0 z-[130] bg-slate-950/90 flex items-center justify-center text-sm font-black text-white">
          Сохраняем результат игры…
        </div>
      )}

      <div className="py-3">
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
