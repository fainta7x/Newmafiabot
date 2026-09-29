/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnnouncementPhotosCard } from '../components/crm/AnnouncementPhotosCard.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('AnnouncementPhotosCard', () => {
  it('lists the club photos and changes which evenings a photo is for', async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (!init?.method) return reply({ photos: [{ id: 'p1', audience: 'all', url: '/announce-photo/p1.jpg', size: 10 }] });
      return reply({ ok: true });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<AnnouncementPhotosCard />);
    const select = await screen.findByLabelText('Для каких вечеров');
    expect(document.querySelector('img')?.getAttribute('src')).toBe('/announce-photo/p1.jpg');
    fireEvent.change(select, { target: { value: 'NOVICE' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/announcement-photos/p1', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ audience: 'NOVICE' }) })));
  });

  it('says so when there are no photos yet', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ photos: [] })));
    render(<AnnouncementPhotosCard />);
    expect(await screen.findByText('Фото пока нет.')).toBeTruthy();
  });
});
