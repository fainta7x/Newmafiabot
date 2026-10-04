/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { GameAnalysis } from '../components/crm/tournaments/protocol/GameAnalysis.tsx';

afterEach(cleanup);

const players = Array.from({ length: 10 }, (_, index) => ({ seat_number: index + 1, display_name: `Игрок ${index + 1}`, role: index === 3 ? 'sheriff' : 'citizen', player_id: `p${index + 1}` })) as any;
let seq = 0;
const ev = (round: number, kind: string, extra: any = {}) => ({ seq: ++seq, at: '2026-10-04T10:00:00Z', round, phase: 'day_voting', kind, ...extra });

describe('game analysis view', () => {
  it('renders nothing without a chronology', () => {
    const { container } = render(<GameAnalysis events={[]} playerResults={players} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows the summary and opens a circle with its voting', () => {
    seq = 0;
    const events = [
      ev(1, 'nomination', { seat: 3, by: 1 }),
      ev(1, 'vote', { seat: 1, target: 3, value: 1 }),
      ev(1, 'vote', { seat: 2, target: 3, value: 1 }),
      ev(1, 'vote_round_result', { value: '1:single_eliminated' }),
      ev(1, 'exit', { seat: 3, value: 'voted_day' }),
      ev(2, 'game_end', { value: 'red' }),
    ];
    render(<GameAnalysis events={events as any} playerResults={players} />);
    expect(screen.getByText('Победа красных')).toBeTruthy();
    expect(screen.getByText('Голосов: 2')).toBeTruthy();
    fireEvent.click(screen.getByTestId('game-analysis-circle-1').querySelector('button')!);
    expect(screen.getByText('выбывает один')).toBeTruthy();
    expect(screen.getByText(/заголосован/)).toBeTruthy();
  });
});
