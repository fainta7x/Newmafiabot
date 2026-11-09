/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appConfirm, appNotice } from '../lib/appConfirm.ts';
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

  it('a notice has one button and resolves when it is pressed; without a host it falls back to alert', async () => {
    const nativeAlert = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    await appNotice('Без окна приложения');
    expect(nativeAlert).toHaveBeenCalledWith('Без окна приложения');
    render(<AppConfirmHost />);
    let done = false;
    const notice = appNotice('Резервная копия не сохранилась').then(() => { done = true; });
    expect((await screen.findByTestId('app-confirm')).textContent).toContain('Резервная копия не сохранилась');
    expect(screen.queryByText('Отмена')).toBeNull();
    fireEvent.click(screen.getByTestId('app-confirm-ok'));
    await notice;
    expect(done).toBe(true);
  });

  it('the last mounted host answers, and the one below takes over when it goes away', async () => {
    const outer = render(<AppConfirmHost />);
    const inner = render(<AppConfirmHost />);
    const first = appConfirm('Вопрос 1');
    fireEvent.click((await screen.findAllByTestId('app-confirm-ok'))[0]);
    expect(await first).toBe(true);
    inner.unmount();
    const second = appConfirm('Вопрос 2');
    fireEvent.click(await screen.findByTestId('app-confirm-ok'));
    expect(await second).toBe(true);
    outer.unmount();
  });
});
