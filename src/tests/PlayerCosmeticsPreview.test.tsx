// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import PlayerCosmeticsPreview from '../components/player/PlayerCosmeticsPreview.tsx';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('previews all three autumn assets without purchasing or equipping anything', () => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  render(<PlayerCosmeticsPreview nickname="Chagin" initialOpen />);
  expect(screen.getByAltText('Медная рамка с багряными листьями').getAttribute('src')).toContain('fiery-autumn-frame');
  fireEvent.click(screen.getByRole('button', { name: 'Покер' }));
  expect(screen.getByTestId('autumn-scene-poker')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Эфир' }));
  expect(screen.getByTestId('autumn-scene-broadcast')).toBeTruthy();
  expect(screen.getByText(/Предметы ещё не выпущены/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Купить|Надеть/ })).toBeNull();
  expect(fetch).not.toHaveBeenCalled(); fetch.mockRestore();
});
