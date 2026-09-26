// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LearningProgressCRM } from '../components/crm/LearningProgressCRM.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const players = [
  { id: 'p1', nickname: 'Анна', club_stage: null, game_level: null, passed: { basic: '2026-09-26 10:00:00', advanced: '2026-09-26 11:00:00' } },
  { id: 'p2', nickname: 'Борис', club_stage: null, game_level: null, passed: { basic: '2026-09-20 10:00:00' } },
  { id: 'p3', nickname: 'Вера', club_stage: null, game_level: null, passed: {} },
];

describe('curator learning screen', () => {
  it('filters by level, result and nickname', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ players }), { status: 200 })));
    const opened: string[] = [];
    render(<LearningProgressCRM onOpenPlayer={(id) => opened.push(id)} />);
    await waitFor(() => expect(screen.getAllByTestId('crm-learning-row')).toHaveLength(2));
    // Most recent pass first.
    expect(screen.getAllByTestId('crm-learning-row')[0].textContent).toContain('Анна');

    fireEvent.click(screen.getByTestId('crm-learning-level-advanced'));
    expect(screen.getAllByTestId('crm-learning-row').map((row) => row.textContent)).toEqual([expect.stringContaining('Анна')]);
    fireEvent.click(screen.getByTestId('crm-learning-status-not_passed'));
    expect(screen.getAllByTestId('crm-learning-row')).toHaveLength(2);
    fireEvent.click(screen.getByTestId('crm-learning-status-nothing'));
    expect(screen.getAllByTestId('crm-learning-row').map((row) => row.textContent)).toEqual([expect.stringContaining('Вера')]);

    fireEvent.click(screen.getByTestId('crm-learning-status-passed'));
    fireEvent.click(screen.getByText('Любой уровень'));
    fireEvent.change(screen.getByTestId('crm-learning-search'), { target: { value: 'бор' } });
    const [row] = screen.getAllByTestId('crm-learning-row');
    fireEvent.click(row);
    expect(opened).toEqual(['p2']);
  });
});
