/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PostTemplatesCard, previewTemplate } from '../components/crm/PostTemplatesCard.tsx';

const placeholders = [{ token: '{когда}', meaning: 'день', example: 'В пятницу' }, { token: '{ссылка}', meaning: 'ссылка', example: 'https://x' }];
const template = { key: 'vk_club_evening', label: 'Пост в ВК: клубный вечер', default_body: 'Привет! {когда} {ссылка}', body: 'Привет! {когда} {ссылка}', customized: false, placeholders };

describe('«Текст постов» in the CRM', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('shows the preview with example values, inserts a placeholder and saves', async () => {
    const calls: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: any) => {
      if (init?.method === 'PUT') { calls.push(JSON.parse(init.body)); return new Response(JSON.stringify({ templates: [{ ...template, body: JSON.parse(init.body).body, customized: true }] }), { status: 200 }); }
      return new Response(JSON.stringify({ templates: [template] }), { status: 200 });
    }));
    render(<PostTemplatesCard />);
    await waitFor(() => expect(screen.getByTestId('post-template-preview').textContent).toBe('Привет! В пятницу https://x'));
    fireEvent.change(screen.getByLabelText('Пост в ВК: клубный вечер'), { target: { value: 'Играем! {ссылка}' } });
    expect(screen.getByTestId('post-template-preview').textContent).toBe('Играем! https://x');
    fireEvent.click(screen.getByText('Сохранить'));
    await waitFor(() => expect(calls).toEqual([{ body: 'Играем! {ссылка}' }]));
    expect(await screen.findByText(/Текст сохранён/)).toBeTruthy();
  });

  it('previewTemplate replaces every occurrence', () => {
    expect(previewTemplate('{когда}, {когда}', placeholders)).toBe('В пятницу, В пятницу');
  });
});
