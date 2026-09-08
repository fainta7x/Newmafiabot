/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PlayerProfileReminder, requestPlayerProfileCompletenessRefresh } from '../components/player/PlayerProfileCompleteness.tsx';

const responseFor = (percentage: number, complete = false) => ({
  ok: true,
  json: async () => ({ completeness: { percentage, complete, missing_fields: complete ? [] : ['avatar'], important_missing_fields: complete ? [] : ['avatar'], next_missing_field: complete ? null : 'avatar', fields: { avatar: { label: 'Фото профиля', weight: 20, complete, state: complete ? 'provided' : 'missing' } }, updated_at: null, checked_at: null } }),
});

describe('PlayerProfileReminder', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); sessionStorage.clear(); });

  it('shows percentage, direct action and dismisses only for the current visit', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(responseFor(80)));
    const open = vi.fn();
    render(<PlayerProfileReminder playerId="p1" onOpenProfile={open} />);
    expect(await screen.findByText('Заполни профиль · 80%')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Заполнить профиль' }));
    expect(open).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Скрыть напоминание до следующего визита' }));
    expect(screen.queryByTestId('profile-completion-reminder')).toBeNull();
    expect(sessionStorage.getItem('profile-completeness-dismissed:p1')).toBe('1');
  });

  it('disappears automatically when profile becomes complete', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(responseFor(80)).mockResolvedValue(responseFor(100, true));
    vi.stubGlobal('fetch', fetchMock);
    render(<PlayerProfileReminder playerId="p2" onOpenProfile={() => {}} />);
    expect(await screen.findByTestId('profile-completion-reminder')).toBeTruthy();
    requestPlayerProfileCompletenessRefresh();
    await waitFor(() => expect(screen.queryByTestId('profile-completion-reminder')).toBeNull());
  });
});
