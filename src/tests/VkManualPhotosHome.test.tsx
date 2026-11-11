// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import VkManualPhotosHome from '../components/crm/VkManualPhotosHome.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const answer = (items: unknown[]) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items }), { headers: { 'Content-Type': 'application/json' } })));

describe('«Фото для постов ВК» on the CRM home', () => {
  it('shows nothing while no picture waits', async () => {
    answer([]);
    const { container } = render(<VkManualPhotosHome />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });
  it('lists a waiting picture with download, open and done actions', async () => {
    answer([{ id: 'abc12345', title: 'Анонс: Вечер', post_url: 'https://vk.com/wall-1_2', created_at: '2026-11-11T10:00:00Z' }]);
    render(<VkManualPhotosHome />);
    expect(await screen.findByText('Анонс: Вечер')).toBeTruthy();
    expect(screen.getByLabelText('Скачать картинку: Анонс: Вечер')).toBeTruthy();
    expect(screen.getByLabelText('Открыть пост в ВК: Анонс: Вечер')).toBeTruthy();
    expect(screen.getByLabelText('Картинка прикреплена: Анонс: Вечер')).toBeTruthy();
  });
});
