// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SplitThreeTraining } from '../components/public/SplitThreeTraining.tsx';
import type { SplitThreeScenario } from '../lib/splitThreeTraining.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const easy: SplitThreeScenario = { killed: 10, candidates: [5, 2, 8], split: [5, 2, 8], seat: 3 };
const medium: SplitThreeScenario = { killed: 10, candidates: [7, 2, 5, 9, 4], split: [2, 9, 4], seat: 1 };
const progress = (passed: string[]) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ passed }), { status: 200 })));

describe('three-way split trainer screen', () => {
  it('asks for your own vote at the easy level and explains who votes where', async () => {
    progress([]);
    render(<SplitThreeTraining initial={[easy, easy]} />);
    await waitFor(() => expect(screen.getByTestId('split-three-level-three_medium').textContent).toContain('Сначала сдай экзамен'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Практика · 5 вопросов' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'В 5' }));
    fireEvent.click(screen.getByRole('button', { name: 'Проверить ответ' }));
    const status = screen.getByRole('status').textContent || '';
    expect(status).toContain('Тебе нужно голосовать в 2');
    expect(status).toContain('В 5 голосуют 258');
    expect(status).toContain('В 2 голосуют 134');
    expect(status).toContain('В 8 голосуют 679');
  });

  it('lets you distribute the whole table at the medium level', async () => {
    progress(['three_easy']);
    render(<SplitThreeTraining initial={[medium, medium]} />);
    await waitFor(() => expect(screen.getByTestId('split-three-level-three_medium').querySelector('button')!.hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getAllByRole('button', { name: 'Практика · 5 вопросов' })[1]);
    const pick = (...seats: number[]) => seats.forEach((seat) => fireEvent.click(screen.getByRole('button', { name: String(seat) })));
    fireEvent.click(screen.getByRole('button', { name: 'Пропустить' })); // 7
    pick(2, 4, 9); fireEvent.click(screen.getByRole('button', { name: 'Продолжить' })); // 2
    fireEvent.click(screen.getByRole('button', { name: 'Пропустить' })); // 5
    pick(1, 3, 5); fireEvent.click(screen.getByRole('button', { name: 'Продолжить' })); // 9 → the rest go to 4
    expect(screen.getByTestId('split-three-review').textContent).toContain('В 4: 678');
    fireEvent.click(screen.getByRole('button', { name: 'Проверить голосование' }));
    expect(screen.getByRole('status').textContent).toContain('Верно!');
  });

  it('keeps the player on the fifth exam task while the result is saving', async () => {
    let finishSave: (response: Response) => void = () => undefined;
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => (init?.method === 'POST'
      ? new Promise<Response>((resolve) => { finishSave = resolve; })
      : Promise.resolve(new Response(JSON.stringify({ passed: [] }), { status: 200 })))));
    render(<SplitThreeTraining initial={[easy, easy, easy, easy, easy]} />);
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Экзамен · 5 вопросов' })[0].hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getAllByRole('button', { name: 'Экзамен · 5 вопросов' })[0]);
    for (let task = 0; task < 5; task += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'В 2' }));
      fireEvent.click(screen.getByRole('button', { name: 'Проверить ответ' }));
      if (task < 4) fireEvent.click(screen.getByRole('button', { name: 'Следующая задача' }));
    }
    expect(screen.getByText('Сохраняем результат экзамена…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Следующая задача' })).toBeNull();
    finishSave(new Response(JSON.stringify({ passed: ['three_easy'] }), { status: 200 }));
    await waitFor(() => expect(screen.getByTestId('split-three-result').textContent).toContain('Экзамен сдан: 5 из 5'));
  });

  it('shows the two sheriffs at the hard level and checks the whole table', async () => {
    const hard: SplitThreeScenario = {
      killed: 10, candidates: [4, 2, 7], split: [4, 2, 7], seat: 3,
      sheriffs: { trusted: { seat: 1, check: 6, black: false }, doubted: { seat: 4, check: 2, black: true } },
    };
    progress(['three_easy', 'three_medium']);
    render(<SplitThreeTraining initial={[hard, hard]} />);
    await waitFor(() => expect(screen.getByTestId('split-three-level-three_hard').querySelector('button')!.hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getAllByRole('button', { name: 'Практика · 5 вопросов' })[2]);
    const claims = screen.getByTestId('split-three-sheriffs').textContent || '';
    expect(claims).toContain('Город меньше верит шерифу 4');
    expect(claims).toContain('Шериф 4 проверил 2 — чёрный');
    const pick = (...seats: number[]) => seats.forEach((seat) => fireEvent.click(screen.getByRole('button', { name: String(seat) })));
    // Plain seat order would be wrong here: 1 and 2 must vote for 4.
    pick(2, 4, 7); fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
    pick(1, 3, 5); fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
    fireEvent.click(screen.getByRole('button', { name: 'Проверить голосование' }));
    const status = screen.getByRole('status').textContent || '';
    expect(status).toContain('Распределение голосов неверное');
    expect(status).toContain('Если прав шериф 4, мафия — 1 и 2: они голосуют в 4');
    expect(status).toContain('В 4 голосуют 127');

    fireEvent.click(screen.getByRole('button', { name: 'Следующая задача' }));
    pick(1, 2, 7); fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
    pick(3, 4, 5); fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
    fireEvent.click(screen.getByRole('button', { name: 'Проверить голосование' }));
    expect(screen.getByRole('status').textContent).toContain('Верно!');
  });
});
