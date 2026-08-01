/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { PointStepper, roundTenths } from '../components/crm/tournaments/protocol/PointStepper';

describe('PointStepper Component', () => {
  afterEach(() => {
    cleanup();
  });

  it('rounds value to tenths correctly', () => {
    expect(roundTenths(0.1 + 0.2)).toBe(0.3);
    expect(roundTenths(0.30000000000000004)).toBe(0.3);
    expect(roundTenths(-0.7000000000000001)).toBe(-0.7);
  });

  it('changes value by step 0.1 on button press', () => {
    const handleChange = vi.fn();
    render(
      <PointStepper
        value={0}
        min={-1}
        max={1}
        step={0.1}
        onChange={handleChange}
        ariaLabelMinus="Decrease step"
        ariaLabelPlus="Increase step"
      />
    );

    const minusBtn = screen.getByRole('button', { name: 'Decrease step' });
    const plusBtn = screen.getByRole('button', { name: 'Increase step' });

    fireEvent.click(minusBtn);
    expect(handleChange).toHaveBeenLastCalledWith(-0.1);

    fireEvent.click(plusBtn);
    expect(handleChange).toHaveBeenLastCalledWith(0.1);
  });

  it('disables decrease button at min boundary (-1) and increase button at max boundary (+1)', () => {
    const handleChange = vi.fn();
    const { unmount } = render(
      <PointStepper
        value={-1}
        min={-1}
        max={1}
        step={0.1}
        onChange={handleChange}
        ariaLabelMinus="Decrease boundary"
        ariaLabelPlus="Increase boundary"
      />
    );

    let minusBtn = screen.getByRole('button', { name: 'Decrease boundary' }) as HTMLButtonElement;
    let plusBtn = screen.getByRole('button', { name: 'Increase boundary' }) as HTMLButtonElement;

    expect(minusBtn.disabled).toBe(true);
    expect(plusBtn.disabled).toBe(false);

    unmount();

    render(
      <PointStepper
        value={1}
        min={-1}
        max={1}
        step={0.1}
        onChange={handleChange}
        ariaLabelMinus="Decrease boundary"
        ariaLabelPlus="Increase boundary"
      />
    );

    minusBtn = screen.getByRole('button', { name: 'Decrease boundary' }) as HTMLButtonElement;
    plusBtn = screen.getByRole('button', { name: 'Increase boundary' }) as HTMLButtonElement;

    expect(minusBtn.disabled).toBe(false);
    expect(plusBtn.disabled).toBe(true);
  });

  it('disables both buttons when disabled prop is true', () => {
    const handleChange = vi.fn();
    render(
      <PointStepper
        value={0}
        min={-1}
        max={1}
        step={0.1}
        disabled={true}
        onChange={handleChange}
        ariaLabelMinus="Decrease disabled"
        ariaLabelPlus="Increase disabled"
      />
    );

    const minusBtn = screen.getByRole('button', { name: 'Decrease disabled' }) as HTMLButtonElement;
    const plusBtn = screen.getByRole('button', { name: 'Increase disabled' }) as HTMLButtonElement;

    expect(minusBtn.disabled).toBe(true);
    expect(plusBtn.disabled).toBe(true);

    fireEvent.click(minusBtn);
    fireEvent.click(plusBtn);
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('correctly maps penalty_points: visual minus increases stored positive penalty_points, visual plus decreases stored penalty_points', () => {
    // Game penalty logic mapping in protocol:
    // Stored penalty_points: 0.1
    // Represented in PointStepper as value={-0.1}, min={-1.0}, max={0}
    let storedPenalty = 0.1;
    const updateStoredPenalty = (newVal: number) => {
      storedPenalty = roundTenths(Math.abs(newVal));
    };

    const { unmount } = render(
      <PointStepper
        value={-storedPenalty}
        min={-1.0}
        max={0}
        step={0.1}
        onChange={updateStoredPenalty}
        ariaLabelMinus="Increase penalty"
        ariaLabelPlus="Decrease penalty"
        formatValue={(v) => (roundTenths(v) === 0 ? '0' : `−${Math.abs(roundTenths(v))}`)}
      />
    );

    expect(screen.getByText('−0.1')).toBeTruthy();

    // Clicking minus decreases displayed value to -0.2 (meaning stored penalty_points becomes +0.2)
    const minusBtn = screen.getByRole('button', { name: 'Increase penalty' });
    fireEvent.click(minusBtn);
    expect(storedPenalty).toBe(0.2);

    unmount();

    render(
      <PointStepper
        value={-storedPenalty}
        min={-1.0}
        max={0}
        step={0.1}
        onChange={updateStoredPenalty}
        ariaLabelMinus="Increase penalty"
        ariaLabelPlus="Decrease penalty"
        formatValue={(v) => (roundTenths(v) === 0 ? '0' : `−${Math.abs(roundTenths(v))}`)}
      />
    );
    expect(screen.getByText('−0.2')).toBeTruthy();

    // Clicking plus increases displayed value to -0.1 (meaning stored penalty_points decreases to 0.1)
    const plusBtn = screen.getByRole('button', { name: 'Decrease penalty' });
    fireEvent.click(plusBtn);
    expect(storedPenalty).toBe(0.1);
  });
});
