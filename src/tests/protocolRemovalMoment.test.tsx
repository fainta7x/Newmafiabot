/** @vitest-environment jsdom */
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { PlayerSheet } from '../components/crm/gameProtocol/PlayersView';
import type { LiveGameEvent } from '../shared/liveGameEvents';
import type { ProtocolApi } from '../components/crm/gameProtocol/types';

afterEach(cleanup);
// Owner, 2026-11-07: a removal set in the protocol is tied to a circle and a moment; a hint says when the game ended by it.
it('«Когда удалён?» writes the removal into the chosen circle and moment, and hints the end of the game', () => {
  let events: LiveGameEvent[] = [];
  const roles = ['citizen', 'mafia', 'don', 'citizen'];
  function Harness() {
    const [list, setList] = useState<LiveGameEvent[]>([]);
    const [results, setResults] = useState(roles.map((role, i) => ({ participant_id: `p${i + 1}`, seat_number: i + 1, display_name: `Игрок ${i + 1}`, role, exit_type: 'alive', color_protocol: [] })));
    events = list;
    const api = {
      locked: false, tableSize: 10, results, protocol: { events: list, votes: [], shots: [{ night_number: 2 }] }, setEvents: setList,
      updateResult: (id: string, updates: any) => setResults((rows) => rows.map((row) => (row.participant_id === id ? { ...row, ...updates } : row))),
      removeByJudge: () => {}, cancelRemoval: () => {}, causePpk: () => {}, cancelPpk: () => {}, changeRegularFoul: () => {}, changeTechFoul: () => {},
    } as unknown as ProtocolApi;
    return <PlayerSheet api={api} seat={1} onClose={() => {}} />;
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole('radio', { name: 'Удалён' }));
  expect(screen.getByTestId('removal-moment')).toBeDefined();
  fireEvent.change(screen.getByRole('combobox', { name: 'Круг' }), { target: { value: '1' } });
  fireEvent.click(screen.getByRole('radio', { name: 'На голосовании' }));
  fireEvent.click(screen.getByRole('button', { name: 'Записать удаление' }));
  expect(events).toEqual([expect.objectContaining({ kind: 'exit', seat: 1, value: 'removed', round: 2, phase: 'day_voting' })]);
  expect(screen.queryByTestId('removal-moment')).toBeNull();
  // Three left: one red, two blacks — the blacks won by this removal.
  expect(screen.getByTestId('removal-end-hint').textContent).toContain('победой чёрных');
});
