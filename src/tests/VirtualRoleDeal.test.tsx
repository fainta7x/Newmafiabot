// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import VirtualRoleDeal from '../components/game/VirtualRoleDeal.tsx';
import { tableRoleCounts } from '../lib/tableComposition.ts';

const seats = (n: number) => Array.from({ length: n }, (_, i) => ({ seat_number: i + 1, nickname: 'Player ' + (i + 1) }));
const choose = (position: number) => {
  fireEvent.click(screen.getByRole('button', { name: `Карта №${position}` }));
  fireEvent.click(screen.getByRole('button', { name: `Открыть карту №${position}` }));
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить роль и продолжить' }));
};
beforeEach(() => {
  vi.stubGlobal('crypto', { getRandomValues: (a: Uint32Array) => { a[0] = 0; return a; } });
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('VirtualRoleDeal', () => {
  it.each([8, 9, 10])('deals correct %i-player composition, any card index and horizontal row', (n) => {
    const complete = vi.fn();
    render(<VirtualRoleDeal seats={seats(n)} onCancel={vi.fn()} onComplete={complete} />);
    fireEvent.click(screen.getByRole('button',{name:'Включить музыку и начать раздачу'}));
    const grid = screen.getByTestId('virtual-card-grid');
    expect(grid.className).toContain('overflow-x-auto');
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
    render(<VirtualRoleDeal seats={seats(10)} onCancel={vi.fn()} onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button',{name:'Включить музыку и начать раздачу'}));
    choose(7);
    expect(screen.getAllByRole('button', { name: /^Карта №/ })).toHaveLength(9);
    fireEvent.click(screen.getByRole('button', { name: 'Отменить последнюю карту' }));
    expect(screen.getAllByRole('button', { name: /^Карта №/ })).toHaveLength(10);
    expect(screen.getByText('Выбирает: №1 Player 1')).toBeTruthy();
    choose(3);
    expect(screen.getAllByRole('button', { name: /^Карта №/ })).toHaveLength(9);
  });
  it('asks for confirmation before discarding the deal', () => {
    render(<VirtualRoleDeal seats={seats(10)} onCancel={vi.fn()} onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button',{name:'Включить музыку и начать раздачу'}));
    choose(2);
    fireEvent.click(screen.getByRole('button', { name: 'Перераздать всё' }));
    fireEvent.click(screen.getByRole('button', { name: 'Нет' }));
    expect(screen.getAllByRole('button', { name: /^Карта №/ })).toHaveLength(9);
    fireEvent.click(screen.getByRole('button', { name: 'Перераздать всё' }));
    fireEvent.click(screen.getByRole('button', { name: 'Да, перераздать' }));
    expect(screen.getAllByRole('button', { name: /^Карта №/ })).toHaveLength(10);
  });
  it('requires a deliberate reset when closing after a reveal',()=>{
    const close=vi.fn();render(<VirtualRoleDeal seats={seats(10)} onCancel={close} onComplete={vi.fn()}/>);
    fireEvent.click(screen.getByRole('button',{name:'Включить музыку и начать раздачу'}));
    fireEvent.click(screen.getByRole('button',{name:'Карта №3'}));fireEvent.click(screen.getByRole('button',{name:'Открыть карту №3'}));
    fireEvent.click(screen.getByRole('button',{name:'Закрыть раздачу'}));expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Продолжить раздачу'}));expect(screen.getByRole('status')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Закрыть раздачу'}));fireEvent.click(screen.getByRole('button',{name:'Подтвердить сброс и закрыть'}));expect(close).toHaveBeenCalledOnce();
  });
  it('allows another seat first and then returns to the first unassigned seat',()=>{
    render(<VirtualRoleDeal seats={seats(10)} onCancel={vi.fn()} onComplete={vi.fn()}/>);
    fireEvent.click(screen.getByRole('button',{name:'Включить музыку и начать раздачу'}));
    fireEvent.click(screen.getByRole('button',{name:/№7 Player 7/}));choose(1);
    expect(screen.getByText('Выбирает: №1 Player 1')).toBeTruthy();
  });

  it('keeps the same completed assignments after a failed save and allows retry',async()=>{
    const save=vi.fn().mockRejectedValueOnce(new Error('Сервер недоступен')).mockResolvedValue(undefined);
    render(<VirtualRoleDeal seats={seats(10)} onCancel={vi.fn()} onComplete={save}/>);
    fireEvent.click(screen.getByRole('button',{name:'Включить музыку и начать раздачу'}));
    for(let i=0;i<10;i++)choose(1);
    fireEvent.click(screen.getByRole('button',{name:'Все роли выданы — начать игру'}));
    await screen.findByRole('alert');await waitFor(()=>expect((screen.getByRole('button',{name:'Все роли выданы — начать игру'}) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button',{name:'Все роли выданы — начать игру'}));
    await waitFor(()=>expect(save).toHaveBeenCalledTimes(2));expect(save.mock.calls[0][0]).toEqual(save.mock.calls[1][0]);
  });

});
