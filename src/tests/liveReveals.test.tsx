/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deriveLiveGameEvents, type LiveEventSnapshot } from '../lib/liveGameEventLog';
import { describeLiveGameEvents } from '../lib/liveGameEventText';
import { addReveal, normalizeReveals, removeAnnouncedCheck, removeReveal, setAnnouncedCheck } from '../lib/liveReveals';
import { cloneLiveSnapshot, normalizeLiveSnapshotForRestore, createEmptyActivePlayer, createInitialLiveDiscipline, type LiveSnapshot } from '../components/LiveGameEngine/engineStateModel';
import { createEmptyLiveProtocolMarkers } from '../lib/gameProtocolCore';
import RevealPanel from '../components/LiveGameEngine/RevealPanel';
import LiveGameJudgeToolbar from '../components/LiveGameEngine/LiveGameJudgeToolbar';

afterEach(cleanup);

describe('reveal model', () => {
  it('records one reveal per seat and one announced check per target', () => {
    let reveals = addReveal([], 3);
    reveals = addReveal(reveals, 3);
    expect(reveals).toEqual([{ seat: 3, checks: [] }]);
    reveals = setAnnouncedCheck(reveals, 3, 7, 'red');
    reveals = setAnnouncedCheck(reveals, 3, 7, 'black'); // the same target again only changes the colour
    reveals = setAnnouncedCheck(reveals, 3, 3, 'red');   // nobody checks himself
    reveals = setAnnouncedCheck(reveals, 3, 11, 'red');  // outside the table
    expect(reveals).toEqual([{ seat: 3, checks: [{ target: 7, color: 'black' }] }]);
    expect(removeAnnouncedCheck(reveals, 3, 7)).toEqual([{ seat: 3, checks: [] }]);
    expect(removeReveal(reveals, 3)).toEqual([]);
  });

  it('cleans what a saved session may contain', () => {
    expect(normalizeReveals(undefined)).toEqual([]);
    expect(normalizeReveals([{ seat: 2, checks: [{ target: 5, color: 'red' }, { target: 5, color: 'black' }, { target: 2, color: 'red' }, { target: 6, color: 'blue' }] }, { seat: 2 }, { seat: 99 }]))
      .toEqual([{ seat: 2, checks: [{ target: 5, color: 'red' }] }]);
  });
});

describe('reveals in the chronology', () => {
  const base = (reveals?: LiveEventSnapshot['reveals']): LiveEventSnapshot => ({ phase: 'day_speeches', roundNumber: 2, reveals });

  it('writes a reveal, announced checks, a changed colour and the removals', () => {
    const none = base();
    const revealed = base([{ seat: 3, checks: [] }]);
    const checked = base([{ seat: 3, checks: [{ target: 7, color: 'red' }] }]);
    const changed = base([{ seat: 3, checks: [{ target: 7, color: 'black' }] }]);
    const cleared = base([{ seat: 3, checks: [] }]);
    const gone = base([]);
    const kinds = (a: LiveEventSnapshot, b: LiveEventSnapshot) => deriveLiveGameEvents(a, b, 1, 'now').map((event) => [event.kind, event.seat, event.target ?? null, event.value ?? null]);
    expect(kinds(none, revealed)).toEqual([['reveal', 3, null, null]]);
    expect(kinds(revealed, checked)).toEqual([['announced_check', 3, 7, 'red']]);
    expect(kinds(checked, changed)).toEqual([['announced_check', 3, 7, 'black']]);
    expect(kinds(changed, cleared)).toEqual([['announced_check_removed', 3, 7, null]]);
    expect(kinds(cleared, gone)).toEqual([['reveal_removed', 3, null, null]]);
    // Old snapshots have no reveals: nothing is invented, and an unchanged list writes nothing.
    expect(kinds(none, none)).toEqual([]);
    expect(kinds(checked, checked)).toEqual([]);
    expect(deriveLiveGameEvents(null, checked, 1, 'now')).toEqual([]);
  });

  it('reads as plain words in the game log', () => {
    const events = deriveLiveGameEvents(base(), base([{ seat: 3, checks: [{ target: 7, color: 'red' }] }]), 1, 'now');
    const lines = describeLiveGameEvents(events, (seat) => `#${seat}`).map((line) => line.text);
    expect(lines).toEqual(['Вскрытие: игрок #3 называет себя шерифом', 'Объявленная проверка игрока #3: #7 — красный']);
  });
});

describe('reveals in the saved session', () => {
  const snapshot = (reveals?: LiveSnapshot['reveals']): LiveSnapshot => ({
    activePlayers: Array.from({ length: 10 }, (_, index) => createEmptyActivePlayer(index + 1)), nominations: [], nominationsMap: {}, phase: 'day_speeches', roundNumber: 2, nightSubPhase: 'intro', postNightStage: 'none',
    protocolMarkers: createEmptyLiveProtocolMarkers(), activeBestMoveSource: null, activeBestMoveSlot: null, pendingBestMoveSeats: [], bestMoveDeadlineMs: null, votingRounds: [], activeVotingRoundIndex: 0,
    votesByPlayer: {}, votes: {}, votingStage: 'setup', revoteSpeakerIndex: 0, tableLeaveVotesInput: null, currentVotingNomineeIndex: 0, activeSpeakerSlot: null, customTimerLabel: null, timeLeft: 60, timerMax: 60,
    isTimerRunning: false, zeroNightSubPhase: null, zeroNightMusicState: 'pending', shotPlayerSlot: null, donCheckSlot: null, donCheckResult: null, sheriffCheckSlot: null, sheriffCheckResult: null, nightLogs: [],
    votingFarewellQueue: [], votingFarewellIndex: 0, discipline: createInitialLiveDiscipline(10), ...(reveals ? { reveals } : {}),
  });

  it('survives Undo copies and a reload, and old sessions simply have none', () => {
    const original = snapshot([{ seat: 3, checks: [{ target: 7, color: 'red' }] }]);
    const copy = cloneLiveSnapshot(original);
    copy.reveals![0].checks.push({ target: 8, color: 'black' });
    expect(original.reveals![0].checks).toHaveLength(1); // the copy is independent: Undo restores the old list
    expect(normalizeLiveSnapshotForRestore(original).reveals).toEqual([{ seat: 3, checks: [{ target: 7, color: 'red' }] }]);
    expect(normalizeLiveSnapshotForRestore(snapshot()).reveals).toEqual([]);
    expect('reveals' in cloneLiveSnapshot(snapshot())).toBe(false);
  });
});

describe('judge panel «Вскрытие»', () => {
  const players = Array.from({ length: 10 }, (_, index) => ({ ...createEmptyActivePlayer(index + 1), nickname: `Игрок${index + 1}`, role: index === 4 ? 'Дон' as const : 'Мирный' as const }));
  const handlers = () => ({ onAddReveal: vi.fn(), onRemoveReveal: vi.fn(), onSetCheck: vi.fn(), onRemoveCheck: vi.fn(), onClose: vi.fn() });

  it('marks who revealed and records the announced checks with a colour', () => {
    const h = handlers();
    const view = render(<RevealPanel players={players} reveals={[]} rolesVisible={false} {...h} />);
    expect(screen.getByText('Пока никто не вскрылся.')).toBeDefined();
    fireEvent.click(screen.getByTestId('live-reveal-seat-5'));
    expect(h.onAddReveal).toHaveBeenCalledWith(5);
    view.rerender(<RevealPanel players={players} reveals={[{ seat: 5, checks: [] }]} rolesVisible={true} {...h} />);
    const card = screen.getByTestId('live-reveal-card-5');
    expect(card.textContent).toContain('вскрылся шерифом');
    expect(card.textContent).toContain('на самом деле Дон'); // the judge sees the truth only with roles visible
    expect((screen.getByTestId('live-reveal-red-5') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Кого проверил 5'), { target: { value: '8' } });
    fireEvent.click(screen.getByTestId('live-reveal-red-5'));
    expect(h.onSetCheck).toHaveBeenCalledWith(5, 8, 'red');
    view.rerender(<RevealPanel players={players} reveals={[{ seat: 5, checks: [{ target: 8, color: 'red' }] }]} rolesVisible={false} {...h} />);
    expect(screen.getByTestId('live-reveal-card-5').textContent).toContain('#8 Игрок8');
    expect(screen.getByTestId('live-reveal-card-5').textContent).not.toContain('на самом деле');
    fireEvent.click(screen.getByLabelText('Убрать проверку 8'));
    expect(h.onRemoveCheck).toHaveBeenCalledWith(5, 8);
    fireEvent.click(screen.getByText('Снять вскрытие'));
    expect(h.onRemoveReveal).toHaveBeenCalledWith(5);
  });

  it('opens from the judge toolbar and shows how many have revealed', () => {
    const onOpen = vi.fn();
    const props = { activePlayers: players, onSelectPlayer: vi.fn(), speechExtensionAvailability: { allowed: false, reason: '' } as any, onSpeechExtension: vi.fn(), historyLength: 0, onUndo: vi.fn(), rolesAreVisible: false, onToggleRoles: vi.fn(), viewMode: 'table' as const, onToggleView: vi.fn(), requiresTableSeatVoting: false };
    render(<LiveGameJudgeToolbar {...props} revealCount={2} onOpenReveals={onOpen} />);
    const button = screen.getByTestId('live-reveal-open');
    expect(button.textContent).toBe('Вскрытие (2)');
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalled();
    cleanup();
    render(<LiveGameJudgeToolbar {...props} />);
    expect(screen.queryByTestId('live-reveal-open')).toBeNull();
  });
});
