/** @vitest-environment jsdom */
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { PlayerSheet } from '../components/crm/gameProtocol/PlayersView';
import { eloTagMarks, splitBreakMarks, type LiveGameEvent } from '../shared/liveGameEvents';
import type { ProtocolApi } from '../components/crm/gameProtocol/types';

afterEach(cleanup);
it('player card edits and removes the same protocol tags, respects circle and lock', () => {
  let events: LiveGameEvent[] = [];
  function Harness({ locked = false }) {
    const [list, setList] = useState<LiveGameEvent[]>([]);
    events = list;
    const api = { locked, tableSize: 10, results: [{ participant_id: 'p1', seat_number: 1, display_name: 'Шериф', role: 'sheriff', exit_type: 'alive', color_protocol: [] }], protocol: { events: list, votes: [], shots: [{ night_number: 2 }] }, setEvents: setList } as unknown as ProtocolApi;
    return <PlayerSheet api={api} seat={1} onClose={() => {}} />;
  }
  const view = render(<Harness />);
  const tag = screen.getByRole('button', { name: /Вскрылся шерифом с шерифом красным/ });
  fireEvent.click(tag);
  expect(eloTagMarks(events)).toEqual([{ tag: 'false_sheriff_red_sheriff', round: 1, seat: 1 }]);
  fireEvent.click(tag);
  expect(eloTagMarks(events)).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: /Сломал попил красным/ }));
  expect(splitBreakMarks(events)).toEqual([{ round: 1, seat: 1 }]);
  fireEvent.click(screen.getByRole('button', { name: /Сломал попил красным/ }));
  expect(splitBreakMarks(events)).toEqual([]);
  fireEvent.change(screen.getByRole('combobox', { name: 'Круг тега' }), { target: { value: '1' } });
  expect(screen.queryByRole('button', { name: /Убил шерифа в нуле/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Вскрылся чёрному/ }));
  expect(eloTagMarks(events)).toEqual([{ tag: 'revealed_to_black', round: 2, seat: 1 }]);
  view.rerender(<Harness locked />);
  expect((screen.getByRole('button', { name: /Вскрылся чёрному/ }) as HTMLButtonElement).disabled).toBe(true);
});
