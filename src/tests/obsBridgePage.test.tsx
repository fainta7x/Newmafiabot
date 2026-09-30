// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ObsBridgePage from '../components/public/ObsBridgePage.tsx';

describe('OBS bridge page', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('starts with the laptop pairing step and explains password privacy', () => {
    render(<ObsBridgePage />);
    expect(screen.getByRole('heading', { name: 'Мост к OBS Studio' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '1. Привяжите ноутбук' })).toBeTruthy();
    expect(screen.getByText('Пароль OBS не отправляется на сервер и не сохраняется.')).toBeTruthy();
  });
});
