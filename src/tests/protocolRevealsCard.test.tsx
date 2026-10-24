// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RevealsCard, nightChecksOf } from '../components/crm/gameProtocol/RevealsCard';

const ROLES = ['citizen', 'citizen', 'citizen', 'don', 'sheriff', 'citizen', 'mafia', 'mafia', 'citizen', 'citizen'];
const results = ROLES.map((role, i) => ({ participant_id: `p${i + 1}`, seat_number: i + 1, display_name: `Игрок ${i + 1}`, role, exit_type: 'alive' })) as any[];

const Harness: React.FC = () => {
  const [events, setEvents] = React.useState<any[]>([]);
  const api = { protocol: { events }, results, locked: false, tableSize: 10, setEvents: (fn: (list: any[]) => any[]) => setEvents((prev) => fn(prev)) } as any;
  return <RevealsCard api={api} />;
};

afterEach(cleanup);

describe('reveals in the protocol', () => {
  it('shows the Sheriff as version 1 and each black reveal as one more version', () => {
    render(<Harness />);
    expect(screen.getByText('Игра в одной версии')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Добавить вскрытие чёрного/ }));
    fireEvent.click(screen.getByRole('button', { name: /^4\b/ }));
    expect(screen.getByText('Версий: 2')).toBeTruthy();
  });
});

describe('announced checks by night', () => {
  const ev = (seq: number, kind: string, extra: Record<string, unknown>) => ({ seq, at: '', round: 2, phase: '', kind, ...extra }) as any;
  it('keeps the order of the nights, numbering live checks by their order and dropping removed ones', () => {
    const events = [
      ev(1, 'announced_check', { seat: 4, target: 1, value: 'red' }),
      ev(2, 'announced_check', { seat: 4, target: 6, value: 'black' }),
      ev(3, 'announced_check', { seat: 4, target: 2, value: 'red', phase: 'night_3' }),
      ev(4, 'announced_check_removed', { seat: 4, target: 1 }),
    ];
    expect(nightChecksOf(events, 4)).toEqual([{ night: 1, target: 6, color: 'black' }, { night: 3, target: 2, color: 'red' }]);
  });

  it('writes a night check and replaces it when the night is changed', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Добавить вскрытие чёрного/ }));
    fireEvent.click(screen.getByRole('button', { name: /^4\b/ }));
    fireEvent.click(screen.getByRole('button', { name: /Вскрытие игрока 4/ }));
    fireEvent.change(screen.getByLabelText('Ночь 1: кого проверил'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Чёрный' }));
    expect(screen.getByText(/Ночь 1: #6 чёрный/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Ночь 1: кого проверил'), { target: { value: '1' } });
    expect(screen.getByText(/Ночь 1: #1 чёрный/)).toBeTruthy();
    expect(screen.queryByText(/#6 чёрный/)).toBeNull();
  });
});
