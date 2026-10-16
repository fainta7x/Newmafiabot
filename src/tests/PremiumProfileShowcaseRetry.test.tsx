/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PremiumProfileShowcase from '../components/player/PremiumProfileShowcase.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('retries a failed history request without leaving the profile', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 503 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ timeline: [], pinned_awards: [] })));
  vi.stubGlobal('fetch', fetcher);
  render(<PremiumProfileShowcase playerId="p1" isSelf={false} section="history" />);
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку' }));
  await screen.findByText('История клуба');
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).toBeNull();
});

it('loads the full showcase when switching from the light pinned section to history', async () => {
  const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ timeline: [], pinned_awards: [], awards: [] })));
  vi.stubGlobal('fetch', fetcher);
  const view = render(<PremiumProfileShowcase playerId="p1" isSelf={false} section="pinned" />);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  view.rerender(<PremiumProfileShowcase playerId="p1" isSelf={false} section="history" />);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(fetcher.mock.calls[0][0]).toContain('?light=1');
  expect(fetcher.mock.calls[1][0]).toBe('/api/player/profiles/p1/showcase');
});
