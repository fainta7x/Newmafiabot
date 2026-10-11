// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LearningActivityCRM from '../components/crm/LearningActivityCRM.tsx';

const item = (extra: Record<string, unknown>) => ({ attempts: 1, best_score: null, max_score: null, passed_at: null, last_at: '2026-10-10T10:00:00.000Z', ...extra });
const players = [
  { id: 'p1', nickname: 'Анна', items: { 'reasoning-course:facts': item({ attempts: 2, best_score: 15, max_score: 20, passed_at: '2026-10-10T10:00:00.000Z' }) } },
  { id: 'p2', nickname: 'Борис', items: { 'reasoning-course:facts': item({ attempts: 4, best_score: 6, max_score: 20 }) } },
  { id: 'p3', nickname: 'Вера', items: { 'judge-training:training': item({ attempts: 1 }) } },
  { id: 'p4', nickname: 'Глеб', items: {} },
];

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('CRM: learning of the reasoning school and the judge trainer', () => {
  it('shows who passed, who is stuck, who tried and who has not started, with filters', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ players }) } as Response)));
    render(<LearningActivityCRM />);
    await waitFor(() => expect(screen.getAllByTestId('crm-learning-activity-row')).toHaveLength(4));
    expect(screen.getByTestId('crm-learning-activity-stuck').textContent).toContain('1');
    expect(screen.getByText(/✓ Факт или фантазия · 15\/20 · 2×/)).toBeTruthy();
    expect(screen.getByText(/буксует · Факт или фантазия · 6\/20 · 4×/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('crm-learning-activity-stuck'));
    expect(screen.getAllByTestId('crm-learning-activity-row').map((row) => row.textContent)).toEqual([expect.stringContaining('Борис')]);
    fireEvent.click(screen.getByTestId('crm-learning-activity-tried'));
    expect(screen.getAllByTestId('crm-learning-activity-row')).toHaveLength(2);
    fireEvent.click(screen.getByTestId('crm-learning-activity-nothing'));
    expect(screen.getAllByTestId('crm-learning-activity-row').map((row) => row.textContent)).toEqual([expect.stringContaining('Глеб')]);
  });
});
