/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appConfirm } from '../lib/appConfirm.ts';
import { AppConfirmHost } from '../components/ui/AppConfirmHost.tsx';

describe('appConfirm', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('falls back to the browser question when no host is mounted', async () => {
    const native = vi.spyOn(window, 'confirm').mockReturnValue(true);
    expect(await appConfirm('Точно?')).toBe(true);
    expect(native).toHaveBeenCalledWith('Точно?');
  });

  it('asks in the app window and returns the answer', async () => {
    const native = vi.spyOn(window, 'confirm');
    render(<AppConfirmHost />);
    const yes = appConfirm('Игроки получат сообщение.', { title: 'Отменить турнир?', confirmLabel: 'Отменить', danger: true });
    expect((await screen.findByTestId('app-confirm')).textContent).toContain('Отменить турнир?');
    fireEvent.click(screen.getByTestId('app-confirm-ok'));
    expect(await yes).toBe(true);
    const no = appConfirm('Ещё раз?');
    fireEvent.click(await screen.findByText('Отмена'));
    expect(await no).toBe(false);
    expect(native).not.toHaveBeenCalled();
    expect(screen.queryByTestId('app-confirm')).toBeNull();
  });
});
