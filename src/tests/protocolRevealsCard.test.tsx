// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RevealsCard } from '../components/crm/gameProtocol/RevealsCard';

const ROLES = ['citizen', 'citizen', 'citizen', 'don', 'sheriff', 'citizen', 'mafia', 'mafia', 'citizen', 'citizen'];
const results = ROLES.map((role, i) => ({ participant_id: `p${i + 1}`, seat_number: i + 1, display_name: `Игрок ${i + 1}`, role, exit_type: 'alive' })) as any[];

const Harness: React.FC = () => {
  const [events, setEvents] = React.useState<any[]>([]);
  const api = { protocol: { events }, results, locked: false, tableSize: 10, setEvents: (fn: (list: any[]) => any[]) => setEvents((prev) => fn(prev)) } as any;
  return <RevealsCard api={api} />;
};

describe('reveals in the protocol', () => {
  it('adds a reveal and its announced check, and shows two versions for two reveals', () => {
    render(<Harness />);
    expect(screen.getByText('Вскрытий нет')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Добавить вскрытие/ }));
    fireEvent.click(screen.getByRole('button', { name: /^4\b/ }));
    fireEvent.click(screen.getAllByRole('radio', { name: /Чёрн/ })[0]);
    expect(screen.getByText('Игра в одной версии')).toBeTruthy();
  });
});
