/**
 * @vitest-environment jsdom
 */
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { PlayerColorProtocolEditor } from '../components/crm/tournaments/protocol/PlayerColorProtocolEditor';
import { PlayerResultData } from '../lib/api';

describe('PlayerColorProtocolEditor', () => {
  afterEach(() => {
    cleanup();
  });
  const basePlayer: PlayerResultData = {
    participant_id: 'p1',
    seat_number: 1,
    display_name: 'Player 1',
    player_id: 'pl1',
    role: 'citizen',
    exit_type: 'alive',
    regular_fouls: 0,
    technical_fouls: 0,
    judge_bonus: 0,
    protocol_bonus: 0,
    penalty_points: 0,
    color_protocol: [],
  };

  const defaultProps = {
    protocolStatus: 'draft' as const,
    selectedColorSeats: [],
    selectedColorMarkType: 'red' as const,
    editingColorMarkState: undefined,
    formatColorMark: (entry: { seat_numbers: number[]; mark: 'red' | 'black' | 'sheriff' }) => 
      `${entry.seat_numbers.join(',')} - ${entry.mark}`,
    onToggleEditColorSeat: vi.fn(),
    onSetEditColorMarkType: vi.fn(),
    onCancelEditColorMark: vi.fn(),
    onSaveEditColorMark: vi.fn(),
    onStartEditColorMark: vi.fn(),
    onMoveColorMark: vi.fn(),
    onDeleteColorMark: vi.fn(),
    onToggleColorSeatSelection: vi.fn(),
    onSetSelectedColorMark: vi.fn(),
    onAddColorMark: vi.fn(),
  };

  it('shows add form for killed player', () => {
    const player = { ...basePlayer, exit_type: 'killed' as const };
    render(<PlayerColorProtocolEditor {...defaultProps} player={player} />);
    
    // Header should be visible
    expect(screen.getByText('Оставленный протокол:')).toBeDefined();
    
    // Add form should be visible
    expect(screen.getByText('Выберите места (1-10):')).toBeDefined();
    expect(screen.getByText('Добавить')).toBeDefined();
  });

  it('renders nothing for voted_day player with no marks', () => {
    const player = { ...basePlayer, exit_type: 'voted_day' as const, color_protocol: [] };
    const { container } = render(<PlayerColorProtocolEditor {...defaultProps} player={player} />);
    
    expect(container.firstChild).toBeNull();
  });

  it('shows saved marks but no add form for voted_day player with existing marks', () => {
    const player = { 
      ...basePlayer, 
      exit_type: 'voted_day' as const, 
      color_protocol: [{ seat_numbers: [2], mark: 'red' as const }] 
    };
    render(<PlayerColorProtocolEditor {...defaultProps} player={player} />);
    
    expect(screen.getByText('Оставленный протокол:')).toBeDefined();
    expect(screen.getByText('2 - red')).toBeDefined(); // custom format output
    expect(screen.getByText('(Статус изменён, но протокол сохранён)')).toBeDefined();
    
    // Add form shouldn't be there
    expect(screen.queryByText('Выберите места (1-10):')).toBeNull();
    expect(screen.queryByText('Добавить')).toBeNull();
  });
});
