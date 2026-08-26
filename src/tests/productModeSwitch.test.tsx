// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProductModeSwitch from '../components/ProductModeSwitch.tsx';

describe('unified product mode switch', () => {
  it('describes and opens organizer mode from the player cabinet', () => {
    const onSwitch = vi.fn();
    render(<ProductModeSwitch activeMode="player" onSwitch={onSwitch} />);

    fireEvent.click(screen.getByRole('button', { name: 'Перейти в режим организатора' }));

    expect(screen.getByText('Управление')).toBeTruthy();
    expect(onSwitch).toHaveBeenCalledOnce();
  });

  it('describes and opens the player cabinet from CRM', () => {
    render(<ProductModeSwitch activeMode="organizer" onSwitch={() => undefined} />);

    expect(screen.getByRole('button', { name: 'Перейти в кабинет игрока' })).toBeTruthy();
    expect(screen.getByText('Кабинет')).toBeTruthy();
  });
});
