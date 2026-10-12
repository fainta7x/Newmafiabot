/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ProjectBoardCRM from '../components/crm/ProjectBoardCRM.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const cards = [
  { id: 'c1', title: 'Покер: чат на столе с ботами', summary: 'Включён, ждём вашей проверки', body: 'Полный текст записи про чат.', direction: 'poker', status: 'waiting', stage: 'check', section: 'Waiting on the owner' },
  { id: 'c2', title: 'Вскрытие дона', summary: 'Статистика связок', body: 'Полный текст.', direction: 'game', status: 'active', stage: 'in_pr', section: 'Current queue' },
];
const pulls = [
  { number: 863, title: 'Вскрытие дона', url: 'https://github.com/x/863', colour: 'ready', author: 'claude', state: 'open', updated_at: '2026-10-12T10:00:00Z', checks: { passed: 4, total: 4 } },
  { number: 861, title: 'Вскрытие и круги', url: 'https://github.com/x/861', colour: 'merged', author: 'claude', state: 'merged', updated_at: '2026-10-12T09:00:00Z', checks: null },
];

const stub = (pullsOk = true) => vi.stubGlobal('fetch', vi.fn(async (url: string) => {
  if (String(url).endsWith('/pulls')) return pullsOk ? new Response(JSON.stringify({ pulls }), { status: 200 }) : new Response(JSON.stringify({ error: 'GitHub сейчас недоступен.' }), { status: 502 });
  return new Response(JSON.stringify({ cards, updated_at: '2026-10-12T10:00:00Z' }), { status: 200 });
}));

describe('project board screen', () => {
  it('shows what waits for the owner first, expandable', async () => {
    stub();
    render(<ProjectBoardCRM />);
    await waitFor(() => expect(screen.getAllByTestId('project-card')).toHaveLength(1));
    expect(screen.getByText('Покер: чат на столе с ботами')).toBeDefined();
    expect(screen.getByText('ждёт проверки')).toBeDefined();
    expect(screen.getByTestId('project-tab-waiting').textContent).toContain('· 1');
  });

  it('groups the roadmap by direction and lists the pull requests with colour and author', async () => {
    stub();
    render(<ProjectBoardCRM />);
    await waitFor(() => screen.getAllByTestId('project-card'));
    fireEvent.click(screen.getByTestId('project-tab-roadmap'));
    expect(screen.getByTestId('project-direction-game').textContent).toContain('Игра и движок');
    expect(screen.getByTestId('project-direction-game').textContent).toContain('в работе 1');
    fireEvent.click(screen.getByTestId('project-tab-prs'));
    const rows = screen.getAllByTestId('project-pr');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('#863');
    expect(rows[0].textContent).toContain('4/4');
    expect(rows[0].textContent).toContain('🤖 Claude');
    expect(screen.getByText('Ещё не слито')).toBeDefined();
  });

  it('tells when GitHub is unavailable but keeps the cards', async () => {
    stub(false);
    render(<ProjectBoardCRM />);
    await waitFor(() => screen.getAllByTestId('project-card'));
    fireEvent.click(screen.getByTestId('project-tab-prs'));
    await waitFor(() => expect(screen.getByText('GitHub сейчас недоступен.')).toBeDefined());
  });
});
