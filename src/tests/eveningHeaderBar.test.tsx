// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../lib/api.ts', () => ({
  api: { getEvening: vi.fn(async () => ({ title: 'Пятница', starts_at: '2026-09-25T16:00:00.000Z', venue: 'Суп с Котом', status: 'published' })) },
}));

const { EveningHeaderBar } = await import('../components/crm/EveningHeaderBar.tsx');

describe('EveningHeaderBar', () => {
  afterEach(() => cleanup());

  it('shows Moscow time, venue and status, and navigates back', async () => {
    const onBack = vi.fn();
    render(<EveningHeaderBar eveningId="e1" onBack={onBack} />);
    await waitFor(() => expect(screen.getByText('Опубликован')).toBeTruthy());
    expect(screen.getByText(/25 сент\..*19:00 · Суп с Котом/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Назад к событиям' }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
