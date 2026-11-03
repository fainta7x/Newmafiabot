// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import VirtualRoleDeal from '../components/game/VirtualRoleDeal.tsx';
import { tableRoleCounts } from '../lib/tableComposition.ts';

const seats = (n: number) => Array.from({ length: n }, (_, i) => ({ seat_number: i + 1, nickname: 'Player ' + (i + 1) }));
// Owner, 2026-11-03: a tapped card shows its role at once; «Следующий игрок» passes the turn.
const turn = () => screen.getByTestId('virtual-deal-turn').textContent || '';
const firstCard = () => (screen.getAllByRole('button', { name: /^Карта №/ })[0].getAttribute('aria-label') || '').replace('Карта №', '');
const choose = (position: number | 'first') => {
  fireEvent.click(screen.getByRole('button', { name: `Карта №${position === 'first' ? firstCard() : position}` }));
  fireEvent.click(screen.getByRole('button', { name: 'Следующий игрок' }));
};
beforeEach(() => {
  vi.stubGlobal('crypto', { getRandomValues: (a: Uint32Array) => { a[0] = 0; return a; } });
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('VirtualRoleDeal', () => {
  it('opens the first player\'s turn by itself; the role shows at once; «Следующий игрок» only after 10 seconds', () => {
    vi.useFakeTimers();
    try {
      render(<VirtualRoleDeal seats={seats(10)} onCancel={vi.fn()} onComplete={vi.fn()} />);
      fireEvent.click(screen.getByRole('button',{name:'Начать раздачу'}));
      expect(turn()).toContain('№1 Player 1');
      expect((screen.getByRole('button', { name: 'Карта №1' }) as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(screen.getByRole('button', { name: 'Карта №1' }));
      expect(screen.getByRole('status').getAttribute('aria-label')).toContain('Роль');
      const next = () => screen.getByTestId('virtual-deal-next-player') as HTMLButtonElement;
      expect(next().disabled).toBe(true);
      act(() => { vi.advanceTimersByTime(9500); });
      expect(next().disabled).toBe(true);
      act(() => { vi.advanceTimersByTime(1000); });
      expect(next().disabled).toBe(false);
      fireEvent.click(next());
      expect(turn()).toContain('№2 Player 2');
      expect(screen.getAllByRole('button', { name: /^Карта №/ })).toHaveLength(9);
      // No faded place: the cards left are numbered 1–9 again (BUSINESS_RULES, virtual deal).
      expect(screen.getAllByRole('button', { name: /^Карта №/ }).map((card) => card.getAttribute('aria-label'))).toEqual(Array.from({ length: 9 }, (_, index) => `Карта №${index + 1}`));
      expect(document.querySelector('.deal-card--taken')).toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it('picks a random card when the player chose none in 10 seconds', () => {
    vi.useFakeTimers();
    try {
      render(<VirtualRoleDeal seats={seats(10)} onCancel={vi.fn()} onComplete={vi.fn()} />);
      fireEvent.click(screen.getByRole('button',{name:'Начать раздачу'}));
      expect(screen.queryByRole('status')).toBeNull();
      act(() => { vi.advanceTimersByTime(10500); });
      expect(screen.getByRole('status').getAttribute('aria-label')).toContain('Роль');
      expect((screen.getByTestId('virtual-deal-next-player') as HTMLButtonElement).disabled).toBe(false);
    } finally { vi.useRealTimers(); }
  });

  it('«Покупка роли» before the deal gives the chosen seat the role and removes that card from the deck', () => {
    const complete = vi.fn();
    render(<VirtualRoleDeal seats={seats(10)} onCancel={vi.fn()} onComplete={complete} cardSeconds={0} />);
    fireEvent.click(screen.getByTestId('virtual-deal-buy-role'));
    fireEvent.click(screen.getByRole('button', { name: /№4 Player 4/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Купить роль Дон' }));
    expect(screen.getByTestId('virtual-deal-notice').textContent).toContain('Дон');
    expect(screen.getByTestId('virtual-deal-notice').textContent).toContain('№4');
    // The don is gone: it can not be bought twice.
    fireEvent.click(screen.getByTestId('virtual-deal-buy-role'));
    expect((screen.getByRole('button', { name: 'Купить роль Дон' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button',{name:'Начать раздачу'}));
    expect(within(screen.getByTestId('virtual-card-grid')).getAllByRole('button')).toHaveLength(9);
  });

  it.each([8, 9, 10])('deals correct %i-player composition, any card index and a two-row grid without a scrolling row', (n) => {
    const complete = vi.fn();
    render(<VirtualRoleDeal seats={seats(n)} onCancel={vi.fn()} onComplete={complete} cardSeconds={0} />);
    fireEvent.click(screen.getByRole('button',{name:'Начать раздачу'}));
    const grid = screen.getByTestId('virtual-card-grid');
    // Owner, 2026-11-01: numbered cards in two rows, never a horizontally scrolling row.
    expect(grid.className).toContain('deal-cards'); // five columns in virtualRoleDeal.css
    expect(grid.className).not.toContain('overflow-x-auto');
    for (let remaining = n; remaining > 0; remaining--) {
      const position = remaining === 4 ? 4 : remaining;
      expect(within(grid).getAllByRole('button')).toHaveLength(remaining);
      choose(position);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Все роли выданы — начать игру' }));
    const assignments = complete.mock.calls[0][0];
    const counts = tableRoleCounts(n);
    for (const role of Object.keys(counts) as (keyof typeof counts)[]) {
      expect(Object.values(assignments).filter((value) => value === role)).toHaveLength(counts[role]);
    }
  });
  it('undo restores the exact previous layout and allows a different choice', () => {
    render(<VirtualRoleDeal seats={seats(10)} onCancel={vi.fn()} onComplete={vi.fn()} cardSeconds={0} />);
    fireEvent.click(screen.getByRole('button',{name:'Начать раздачу'}));
    choose(7);
    expect(screen.getAllByRole('button', { name: /^Карта №/ })).toHaveLength(9);
    fireEvent.click(screen.getByRole('button', { name: 'Отменить последнюю карту' }));
    expect(screen.getAllByRole('button', { name: /^Карта №/ })).toHaveLength(10);
    expect(turn()).toContain('№1 Player 1');
    choose(3);
    expect(screen.getAllByRole('button', { name: /^Карта №/ })).toHaveLength(9);
  });
  it('asks for confirmation before discarding the deal', () => {
    render(<VirtualRoleDeal seats={seats(10)} onCancel={vi.fn()} onComplete={vi.fn()} cardSeconds={0} />);
    fireEvent.click(screen.getByRole('button',{name:'Начать раздачу'}));
    choose(2);
    fireEvent.click(screen.getByRole('button', { name: 'Перераздать всё' }));
    fireEvent.click(screen.getByRole('button', { name: 'Нет' }));
    expect(screen.getAllByRole('button', { name: /^Карта №/ })).toHaveLength(9);
    fireEvent.click(screen.getByRole('button', { name: 'Перераздать всё' }));
    fireEvent.click(screen.getByRole('button', { name: 'Да, перераздать' }));
    expect(screen.getAllByRole('button', { name: /^Карта №/ })).toHaveLength(10);
  });
  it('requires a deliberate reset when closing after a reveal',()=>{
    const close=vi.fn();render(<VirtualRoleDeal seats={seats(10)} onCancel={close} onComplete={vi.fn()} cardSeconds={0}/>);
    fireEvent.click(screen.getByRole('button',{name:'Начать раздачу'}));
    fireEvent.click(screen.getByRole('button',{name:'Карта №3'}));
    fireEvent.click(screen.getByRole('button',{name:'Закрыть раздачу'}));expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Продолжить раздачу'}));expect(screen.getByRole('status')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Закрыть раздачу'}));fireEvent.click(screen.getByRole('button',{name:'Подтвердить сброс и закрыть'}));expect(close).toHaveBeenCalledOnce();
  });
  it('allows another seat first and then returns to the first unassigned seat',()=>{
    render(<VirtualRoleDeal seats={seats(10)} onCancel={vi.fn()} onComplete={vi.fn()} cardSeconds={0}/>);
    fireEvent.click(screen.getByRole('button',{name:'Начать раздачу'}));
    fireEvent.click(screen.getByRole('button',{name:/№7 Player 7/}));choose(1);
    expect(turn()).toContain('№1 Player 1');
  });

  it('keeps the same completed assignments after a failed save and allows retry',async()=>{
    const save=vi.fn().mockRejectedValueOnce(new Error('Сервер недоступен')).mockResolvedValue(undefined);
    render(<VirtualRoleDeal seats={seats(10)} onCancel={vi.fn()} onComplete={save} cardSeconds={0}/>);
    fireEvent.click(screen.getByRole('button',{name:'Начать раздачу'}));
    for(let i=0;i<10;i++)choose('first');
    fireEvent.click(screen.getByRole('button',{name:'Все роли выданы — начать игру'}));
    await screen.findByRole('alert');await waitFor(()=>expect((screen.getByRole('button',{name:'Все роли выданы — начать игру'}) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button',{name:'Все роли выданы — начать игру'}));
    await waitFor(()=>expect(save).toHaveBeenCalledTimes(2));expect(save.mock.calls[0][0]).toEqual(save.mock.calls[1][0]);
  });

});
