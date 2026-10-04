/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WinnerConfirmationOverlay } from '../components/LiveGameEngine/LiveGameOverlays.tsx';

afterEach(cleanup);

describe('winner confirmation', () => {
  it('shows nothing without a winner', () => {
    const { container } = render(<WinnerConfirmationOverlay winner={null} canUndo onUndo={vi.fn()} onConfirm={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('lets the judge confirm the result or take the last action back', () => {
    const onUndo = vi.fn();
    const onConfirm = vi.fn();
    render(<WinnerConfirmationOverlay winner="Красные" canUndo onUndo={onUndo} onConfirm={onConfirm} />);
    expect(screen.getByText('Победили Красные')).toBeTruthy();
    fireEvent.click(screen.getByTestId('live-winner-undo'));
    expect(onUndo).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('live-winner-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('hides the undo button when there is nothing to take back', () => {
    render(<WinnerConfirmationOverlay winner="Чёрные" canUndo={false} onUndo={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.queryByTestId('live-winner-undo')).toBeNull();
  });
});
