import React, { useEffect, useMemo, useState } from 'react';
import type { PlayerResultData, TournamentGameProtocolData } from '../../lib/api';
import { clubGamesApi, type ClubGameRecord } from '../../lib/clubGamesApi';
import { describeLegacyRepairs, repairLegacyClubProtocol } from '../../lib/legacyClubProtocol.ts';
import { ProtocolWorkspace } from './gameProtocol/ProtocolWorkspace';
import { useProtocolEditing } from './gameProtocol/useProtocolEditing';
import { useProtocolAutosave } from './gameProtocol/useProtocolAutosave';
import type { ProtocolState } from './gameProtocol/protocolReview';
import type { ProtocolApi } from './gameProtocol/types';

interface EveningGameProtocolModalProps {
  game: ClubGameRecord;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: (game: ClubGameRecord) => void;
}

export const EveningGameProtocolModal: React.FC<EveningGameProtocolModalProps> = ({
  game,
  isOpen,
  onClose,
  onUpdated,
}) => {
  const source = game.club_protocol;
  // A game saved by an older build may hold facts the checks now refuse (a killed player's night recorded as a miss, repeated
  // round numbers); they are put right from the game's own record when the protocol opens, and said so on screen.
  const repairedSource = useMemo(() => source ? repairLegacyClubProtocol(source.protocol, source.player_results) : null, [source]);
  const [repairNotes, setRepairNotes] = useState<string[]>(() => repairedSource ? describeLegacyRepairs(repairedSource.repairs) : []);
  const [protocol, setProtocol] = useState<TournamentGameProtocolData>(() => repairedSource?.protocol || ({
    game_id: String(game.id),
    status: 'draft',
    winner_team: null,
    first_killed_participant_id: null,
    zero_round_voted_participant_id: null,
    best_move_participant_id: null,
    best_move_source: null,
    best_move_seats: [],
    best_moves: [],
    votes: [],
    shots: [],
    replacement: null,
    judge_notes: null,
  } as TournamentGameProtocolData));
  const [playerResults, setPlayerResults] = useState<PlayerResultData[]>(source?.player_results || []);
  // The protocol as it was when the window opened: «Вы изменили» is the difference from it.
  const [baseline, setBaseline] = useState<ProtocolState | null>(() => (repairedSource && source ? { protocol: repairedSource.protocol, results: source.player_results } : null));
  // The club and the tournament protocol share one autosave (architecture programme, 2026-10-26).
  const autosave = useProtocolAutosave<ClubGameRecord>({
    active: isOpen && protocol.status !== 'completed',
    protocol, playerResults, setProtocol, setPlayerResults,
    send: (nextProtocol, nextResults) => clubGamesApi.saveProtocol(game.id, { protocol: nextProtocol, player_results: nextResults }),
    echoOf: (updated) => updated.club_protocol,
    onSaved: (updated, replaceEditor) => {
      if (replaceEditor && updated.club_protocol) setBaseline({ protocol: updated.club_protocol.protocol, results: updated.club_protocol.player_results });
      onUpdated(updated);
    },
    delayMs: 1000,
    // What the server holds: after an automatic repair the editor differs from it, so a draft saves the repaired record.
    initial: source ? { protocol: source.protocol, playerResults: source.player_results } : undefined,
  });
  const { saveState, saveError, save } = autosave;

  useEffect(() => {
    if (!isOpen || !game.club_protocol) return;
    const repaired = repairLegacyClubProtocol(game.club_protocol.protocol, game.club_protocol.player_results);
    setProtocol(repaired.protocol);
    setPlayerResults(game.club_protocol.player_results);
    setRepairNotes(describeLegacyRepairs(repaired.repairs));
    autosave.markSaved(game.club_protocol.protocol, game.club_protocol.player_results);
    setBaseline({ protocol: repaired.protocol, results: game.club_protocol.player_results });
  }, [game.id, isOpen]);

  const editing = useProtocolEditing({ protocol, setProtocol, playerResults, setPlayerResults });

  const completeGame = async () => {
    const completed = { ...protocol, status: 'completed' as const };
    await save(completed, playerResults, { replaceEditor: true });
  };

  const reopenDraft = async () => {
    if (!confirm('Вернуть подтверждённую игру на исправление?')) return;
    const draft = { ...protocol, status: 'draft' as const, completed_at: null };
    await save(draft, playerResults, { replaceEditor: true });
  };

  if (!isOpen) return null;

  const api: ProtocolApi = {
    protocol, results: playerResults, locked: protocol.status === 'completed', tableSize: playerResults.length, zeroRoundRule: protocol.zero_round_rule ?? 'tournament',
    ...editing.members,
  };
  const saveLabel = saveState === 'saving' ? { label: 'Сохраняем…', tone: 'neutral' as const }
    : saveState === 'unsaved' ? { label: 'Есть несохранённые изменения', tone: 'warn' as const }
      : saveState === 'error' ? { label: 'Не сохранилось', tone: 'bad' as const }
        : { label: 'Сохранено', tone: 'good' as const };
  const close = async () => { if (protocol.status === 'draft' && saveState !== 'saved') await save(); onClose(); };

  return (
    <ProtocolWorkspace
      api={api}
      title={`Игра №${game.global_game_number}`}
      subtitle={`${game.table_name || 'Стол не указан'}${game.judge_name ? ` · судья ${game.judge_name}` : ''}`}
      save={saveLabel}
      saveError={saveState === 'error' && saveError ? `Не сохранилось: ${saveError}` : null}
      baseline={baseline}
      repairNotes={repairNotes}
      busy={saveState === 'saving'}
      onRevert={editing.revertChange}
      onConfirm={completeGame}
      onReopen={reopenDraft}
      onClose={() => void close()}
      resetKey={`${game.id}:${isOpen}`}
    />
  );
};
