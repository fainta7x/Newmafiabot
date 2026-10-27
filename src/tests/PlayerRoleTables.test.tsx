/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlayerRoleTables from '../components/player/PlayerRoleTables.tsx';

afterEach(() => { cleanup(); sessionStorage.clear(); vi.unstubAllGlobals(); });

const table = (key: string, label: string, columns: Array<{ key: string; label: string }>, rows: any[]) => ({
  role: { key, label, hint: `Игроки, игравшие: ${label}`, columns },
  roles: [{ key: 'don', label: 'Дон' }, { key: 'mafia', label: 'Мафия' }, { key: 'sheriff', label: 'Шериф' }, { key: 'citizen', label: 'Мирный' }],
  games_in_scope: 12, total: rows.length, rows,
});

describe('role tables', () => {
  it('lists the Dons with their reveal figures and switches the role', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(String(url));
      const body = String(url).includes('role=mafia')
        ? table('mafia', 'Мафия', [{ key: 'reveals', label: 'Вскрылся' }], [])
        : table('don', 'Дон', [{ key: 'reveals', label: 'Вскрылся сам' }, { key: 'handed', label: 'Отдал вскрытие' }], [
          { player_id: 'p1', nickname: 'Дон Эль', games: 5, wins: 3, win_rate: 60, figures: { reveals: 2, handed: 1 }, is_me: false },
        ]);
      return new Response(JSON.stringify(body), { status: 200 });
    }));
    render(<PlayerRoleTables period="period:autumn" format="RATING" />);
    await waitFor(() => expect(screen.getByTestId('role-row-p1')).toBeDefined());
    const row = screen.getByTestId('role-row-p1');
    expect(row.textContent).toContain('Дон Эль');
    expect(row.textContent).toContain('5 игр');
    expect(row.textContent).toContain('60%');
    expect(row.textContent).toContain('Вскрылся сам: 2');
    expect(row.textContent).toContain('Отдал вскрытие: 1');
    expect(calls[0]).toContain('role=don');
    expect(calls[0]).toContain('period=period%3Aautumn');
    expect(calls[0]).toContain('format=RATING');
    fireEvent.click(screen.getByTestId('role-tab-mafia'));
    await waitFor(() => expect(screen.getByText('В этом выборе за эту роль пока никто не играл.')).toBeDefined());
  });
});

it('shows the complete list extent without removing names or game denominators',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({...table('don','Дон',[],[{player_id:'p1',nickname:'Очень длинное имя игрока',games:3,wins:2,win_rate:67,figures:{}}]),total:40}))));
 render(<PlayerRoleTables period="all" format="all"/>);
 expect(await screen.findByText(/Показано 1 из 40 игроков/)).toBeDefined();
 expect(screen.getByTestId('role-row-p1').textContent).toContain('Очень длинное имя игрока');
 expect(screen.getByTestId('role-row-p1').textContent).toContain('2 победы из 3 игр');
});
