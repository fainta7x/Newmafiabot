import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { PlayerResultData, TournamentGameProtocolData } from '../../lib/api';
import { clubGamesApi, type ClubGameRecord } from '../../lib/clubGamesApi';
import { describeLegacyRepairs, repairLegacyClubProtocol } from '../../lib/legacyClubProtocol.ts';
import { ProtocolWorkspace } from './gameProtocol/ProtocolWorkspace';
import { useProtocolEditing } from './gameProtocol/useProtocolEditing';
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
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // What the server last confirmed. The autosave only runs when the editor differs from it, so the server's own
  // echo (a fresh object every time) can never start another save, and an unchanged protocol is never re-sent.
  const snapshot = (nextProtocol: TournamentGameProtocolData, nextResults: PlayerResultData[]) => JSON.stringify({ nextProtocol, nextResults });
  // What the server holds: after an automatic repair the editor differs from it, so a draft saves the repaired record.
  const savedSnapshotRef = useRef<string>(snapshot(source?.protocol || protocol, playerResults));
  const latestRef = useRef({ protocol, playerResults });
  latestRef.current = { protocol, playerResults };
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const saveSeqRef = useRef(0);

  useEffect(() => {
    if (!isOpen || !game.club_protocol) return;
    const repaired = repairLegacyClubProtocol(game.club_protocol.protocol, game.club_protocol.player_results);
    setProtocol(repaired.protocol);
    setPlayerResults(game.club_protocol.player_results);
    setRepairNotes(describeLegacyRepairs(repaired.repairs));
    savedSnapshotRef.current = snapshot(game.club_protocol.protocol, game.club_protocol.player_results);
    setSaveState('saved');
    setSaveError(null);
    setBaseline({ protocol: repaired.protocol, results: game.club_protocol.player_results });
  }, [game.id, isOpen]);

  const cancelAutoSave = () => {
    if (autoSaveRef.current) { clearTimeout(autoSaveRef.current); autoSaveRef.current = null; }
  };

  // Saves go to the server one after another, and only the newest one may update the screen: an older answer
  // arriving late can no longer put a finished game back to a draft.
  const save = (
    nextProtocol: TournamentGameProtocolData = latestRef.current.protocol,
    nextResults: PlayerResultData[] = latestRef.current.playerResults,
    options: { replaceEditor?: boolean } = {},
  ): Promise<boolean> => {
    cancelAutoSave();
    const seq = ++saveSeqRef.current;
    const sent = snapshot(nextProtocol, nextResults);
    setSaveState('saving');
    setSaveError(null);
    const run = async () => {
      try {
        const updated = await clubGamesApi.saveProtocol(game.id, { protocol: nextProtocol, player_results: nextResults });
        if (seq !== saveSeqRef.current) return true; // a newer save is already on its way and will decide
        const echoed = updated.club_protocol;
        const untouched = snapshot(latestRef.current.protocol, latestRef.current.playerResults) === sent;
        if (echoed) {
          savedSnapshotRef.current = snapshot(echoed.protocol, echoed.player_results);
          if (options.replaceEditor || untouched) {
            setProtocol(echoed.protocol);
            setPlayerResults(echoed.player_results);
          }
          if (options.replaceEditor) setBaseline({ protocol: echoed.protocol, results: echoed.player_results });
        } else {
          savedSnapshotRef.current = sent;
        }
        onUpdated(updated);
        if (options.replaceEditor || untouched) setSaveState('saved');
        else { setSaveState('unsaved'); scheduleAutoSave(); }
        return true;
      } catch (err) {
        console.error(err);
        if (seq === saveSeqRef.current) {
          setSaveError(err instanceof Error ? err.message : 'Не удалось сохранить протокол');
          setSaveState('error');
        }
        return false;
      }
    };
    const result = queueRef.current.then(run, run);
    queueRef.current = result;
    return result;
  };

  const scheduleAutoSave = () => {
    cancelAutoSave();
    autoSaveRef.current = setTimeout(() => { autoSaveRef.current = null; void save(); }, 1000);
  };

  useEffect(() => {
    if (!isOpen || protocol.status === 'completed') return;
    if (snapshot(protocol, playerResults) === savedSnapshotRef.current) {
      cancelAutoSave();
      setSaveState((current) => (current === 'unsaved' ? 'saved' : current));
      return;
    }
    setSaveState((current) => (current === 'saving' ? current : 'unsaved'));
    scheduleAutoSave();
    return cancelAutoSave;
  }, [protocol, playerResults]);

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
