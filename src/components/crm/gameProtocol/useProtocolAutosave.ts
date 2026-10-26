import { useEffect, useRef, useState } from 'react';
import type { PlayerResultData, TournamentGameProtocolData } from '../../../lib/api';

export type ProtocolSaveState = 'saved' | 'saving' | 'unsaved' | 'error';
type Echo = { protocol: TournamentGameProtocolData; player_results: PlayerResultData[] } | null | undefined;

type Options<T> = {
  /** Autosave runs only while this is true (the window is open, loaded and the game is still a draft). */
  active: boolean;
  protocol: TournamentGameProtocolData;
  playerResults: PlayerResultData[];
  setProtocol: (protocol: TournamentGameProtocolData) => void;
  setPlayerResults: (results: PlayerResultData[]) => void;
  /** Sends one save; its answer goes to `echoOf` and `onSaved`. */
  send: (protocol: TournamentGameProtocolData, results: PlayerResultData[]) => Promise<T>;
  /** What the server now holds, from its answer (null: it did not say, the sent version counts as saved). */
  echoOf: (answer: T) => Echo;
  /** The newest save's answer only (an older answer arriving late is ignored). */
  onSaved?: (answer: T, replaceEditor: boolean) => void;
  delayMs: number;
  /** A reason not to send at all (the save stays «unsaved» with that message). */
  hold?: (protocol: TournamentGameProtocolData, results: PlayerResultData[]) => string | null;
  /** Every edit of the draft, before it is sent (the tournament's emergency browser backup). */
  onEdit?: (protocol: TournamentGameProtocolData, results: PlayerResultData[]) => void;
  /** What the server holds when the window opens, when it differs from the editor (a repaired old record). */
  initial?: { protocol: TournamentGameProtocolData; playerResults: PlayerResultData[] };
};

const snapshotOf = (protocol: TournamentGameProtocolData, results: PlayerResultData[]) => JSON.stringify({ protocol, results });

/**
 * The autosave of the protocol window, the same for a club and a tournament game (architecture programme, 2026-10-26).
 * What the server last confirmed is kept as a snapshot: an edit that differs from it is sent after `delayMs`; the server's
 * own echo (a fresh object every time) never starts another save; saves go one after another and only the newest one may
 * update the editor, so an older answer arriving late cannot put a finished game back to a draft.
 */
export function useProtocolAutosave<T>({ active, protocol, playerResults, setProtocol, setPlayerResults, send, echoOf, onSaved, delayMs, hold, onEdit, initial }: Options<T>) {
  const [saveState, setSaveState] = useState<ProtocolSaveState>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  // The last version a save sent and the server accepted: until the editor changes again it counts as saved, even though
  // the server's echo (with its own time stamps) reaches the editor one render later.
  const acceptedSentRef = useRef<string | null>(null);
  const savedSnapshotRef = useRef(snapshotOf(initial?.protocol ?? protocol, initial?.playerResults ?? playerResults));
  const latestRef = useRef({ protocol, playerResults });
  latestRef.current = { protocol, playerResults };
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const saveSeqRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  };

  /** Whatever the server holds now (after loading, or after a confirm/reopen done by another call). */
  const markSaved = (nextProtocol: TournamentGameProtocolData, nextResults: PlayerResultData[]) => {
    cancel();
    savedSnapshotRef.current = snapshotOf(nextProtocol, nextResults);
    acceptedSentRef.current = null;
    setSaveState('saved');
    setSaveError(null);
  };

  const isDirty = () => {
    const current = snapshotOf(latestRef.current.protocol, latestRef.current.playerResults);
    return current !== savedSnapshotRef.current && current !== acceptedSentRef.current;
  };

  const save = (
    nextProtocol: TournamentGameProtocolData = latestRef.current.protocol,
    nextResults: PlayerResultData[] = latestRef.current.playerResults,
    options: { replaceEditor?: boolean } = {},
  ): Promise<boolean> => {
    cancel();
    const blocked = hold?.(nextProtocol, nextResults);
    if (blocked) {
      setSaveState('unsaved');
      setSaveError(blocked);
      return Promise.resolve(false);
    }
    const seq = ++saveSeqRef.current;
    const sent = snapshotOf(nextProtocol, nextResults);
    setSaveState('saving');
    setSaveError(null);
    const run = async () => {
      try {
        const answer = await send(nextProtocol, nextResults);
        acceptedSentRef.current = sent;
        if (seq !== saveSeqRef.current) return true; // a newer save is already on its way and will decide
        const echoed = echoOf(answer);
        const untouched = snapshotOf(latestRef.current.protocol, latestRef.current.playerResults) === sent;
        if (echoed) {
          savedSnapshotRef.current = snapshotOf(echoed.protocol, echoed.player_results);
          if (options.replaceEditor || untouched) {
            setProtocol(echoed.protocol);
            setPlayerResults(echoed.player_results);
          }
        } else {
          savedSnapshotRef.current = sent;
        }
        onSaved?.(answer, Boolean(options.replaceEditor));
        if (options.replaceEditor || untouched) setSaveState('saved');
        else { setSaveState('unsaved'); schedule(); }
        return true;
      } catch (err) {
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

  const schedule = () => {
    cancel();
    timerRef.current = setTimeout(() => { timerRef.current = null; void save(); }, delayMs);
  };

  useEffect(() => {
    if (!active) return;
    if (snapshotOf(protocol, playerResults) === savedSnapshotRef.current) {
      cancel();
      setSaveState((current) => (current === 'unsaved' ? 'saved' : current));
      return;
    }
    onEdit?.(protocol, playerResults);
    setSaveState((current) => (current === 'saving' ? current : 'unsaved'));
    schedule();
    return cancel;
  }, [protocol, playerResults, active]);

  /** Before closing: send what is not saved yet and wait for every save in flight; true when nothing is left unsaved. */
  const flush = async (): Promise<boolean> => {
    cancel();
    if (isDirty()) {
      const ok = await save();
      if (!ok) return false;
    } else {
      await queueRef.current.catch(() => undefined);
    }
    return !isDirty();
  };

  return { saveState, setSaveState, saveError, setSaveError, save, markSaved, flush, isDirty, cancel };
}
