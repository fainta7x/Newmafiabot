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
    expect(await screen.findByText((_, element) => element?.tagName === 'STRONG' && (element.textContent || '').startsWith('Анонс: Вечер'))).toBeTruthy();
    expect(screen.getByLabelText('Скачать картинку: Анонс: Вечер')).toBeTruthy();
    expect(screen.getByLabelText('Открыть пост в ВК: Анонс: Вечер')).toBeTruthy();
    expect(screen.getByLabelText('Картинка прикреплена: Анонс: Вечер')).toBeTruthy();
  });
  // Owner, 2026-11-15 (variant «А»): a post not published yet comes with its text to copy and its picture.
  it('offers the text and the picture of a post to publish by hand', async () => {
    answer([{ id: 'def67890', title: '🏁 Итоги вечера', post_url: null, created_at: '2026-11-15T10:00:00Z', post_text: '🏁 Итоги вечера «Пятница»' }]);
    render(<VkManualPhotosHome />);
    expect(await screen.findByText('🏁 Итоги вечера «Пятница»')).toBeTruthy();
    expect(screen.getByText('Текст')).toBeTruthy();
    expect(screen.getByText('Картинка')).toBeTruthy();
    expect(screen.getByLabelText('Пост выложен: 🏁 Итоги вечера')).toBeTruthy();
  });
});
