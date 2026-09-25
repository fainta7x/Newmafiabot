// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PublicGuide, guideTabFromSearch } from '../components/public/PublicGuide.tsx';
import { GLOSSARY, ROLES, SCENARIO, SIMPLE_RULES, TABLE_RULES, searchGlossary } from '../lib/clubGuide.ts';

afterEach(cleanup);

describe('public guide for novices', () => {
  it('opens the requested section from the link', () => {
    expect(guideTabFromSearch('')).toBe('evening');
    expect(guideTabFromSearch('?tab=roles')).toBe('roles');
    expect(guideTabFromSearch('?tab=rules')).toBe('rules');
    expect(guideTabFromSearch('?tab=glossary')).toBe('glossary');
    expect(guideTabFromSearch('?tab=quiz')).toBe('quiz');
    expect(guideTabFromSearch('?tab=lessons')).toBe('lessons');
    expect(guideTabFromSearch('?tab=nope')).toBe('evening');
  });

  it('finds glossary words by term, alias and meaning, ignoring case and ё', () => {
    expect(searchGlossary('пу').map((item) => item.term)).toContain('ПУ');
    expect(searchGlossary('первоубиенный').map((item) => item.term)).toContain('ПУ');
    expect(searchGlossary('ЧЕРНЫЕ').map((item) => item.term)).toContain('Чёрные');
    expect(searchGlossary('')).toHaveLength(GLOSSARY.length);
  });

  it('states the table compositions the club approved', () => {
    const roles = TABLE_RULES.find((block) => block.title === 'Если за столом 8 или 9')!.points.join(' ');
    expect(roles).toContain('Дон, 2 мафии, Шериф, 5 мирных');
    expect(roles).toContain('Дон, 1 мафия, Шериф, 5 мирных');
  });

  it('keeps club terms out of the plain rules', () => {
    const plain = SIMPLE_RULES.flatMap((block) => [block.title, block.lead || '', ...block.points]).join(' ');
    for (const term of ['ППК', 'техфол', 'Техфол', 'фол ', 'доп. балл', 'Elo']) expect(plain).not.toContain(term);
  });

  it('switches sections and searches the glossary', () => {
    render(<PublicGuide />);
    expect(screen.getAllByTestId('guide-step')).toHaveLength(SCENARIO.length);
    fireEvent.click(screen.getByTestId('guide-tab-roles'));
    expect(screen.getAllByTestId('guide-role')).toHaveLength(ROLES.length);
    expect(screen.getAllByText('Задача:').length).toBe(ROLES.length);
    fireEvent.click(screen.getByTestId('guide-tab-rules'));
    // A novice sees plain words first; the club terms are one tap away.
    expect(screen.getByText('Как тут наказывают')).toBeTruthy();
    expect(screen.queryByText(/ППК/)).toBeNull();
    fireEvent.click(screen.getByTestId('guide-rules-detailed'));
    expect(screen.getAllByText(/ППК/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId('guide-tab-glossary'));
    fireEvent.change(screen.getByTestId('guide-search'), { target: { value: 'техфол' } });
    expect(screen.getAllByTestId('guide-term').map((item) => item.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Техфол')]));
    fireEvent.change(screen.getByTestId('guide-search'), { target: { value: 'абракадабра' } });
    expect(screen.getByText(/Такого слова пока нет/)).toBeTruthy();
  });

  it('lets a novice check the approved basics without a login or rewards', () => {
    render(<PublicGuide initialTab="quiz" />);
    for (const answer of ['Не меньше 8', 'Один Дон и одна мафия', 'Следующая речь длится 30 секунд', 'Нет']) {
      fireEvent.click(screen.getByRole('button', { name: answer }));
      fireEvent.click(screen.getByRole('button', { name: 'Проверить ответ' }));
      expect(screen.getByRole('status').textContent).toContain('Верно');
      fireEvent.click(screen.getByRole('button', { name: /Следующий вопрос|Посмотреть результат/ }));
    }
    expect(screen.getByText('Готово: 4 из 4')).toBeTruthy();
    expect(screen.getByText(/не влияет на доступ к играм, Elo или награды/)).toBeTruthy();
  });

  it('offers a linked learning route through the existing approved material', () => {
    render(<PublicGuide initialTab="lessons" />);
    expect(screen.getAllByTestId('guide-lesson')).toHaveLength(4);
    fireEvent.click(screen.getAllByTestId('guide-lesson')[0]);
    expect(screen.getByTestId('guide-lesson-content').textContent).toContain('Подтверждение организатора не нужно');
    fireEvent.click(screen.getByRole('button', { name: 'Следующий урок' }));
    expect(screen.getAllByTestId('guide-role')).toHaveLength(ROLES.length);
    fireEvent.click(screen.getByRole('button', { name: 'Следующий урок' }));
    expect(screen.getByTestId('guide-lesson-content').textContent).toContain('Голосование');
    fireEvent.click(screen.getByRole('button', { name: 'Следующий урок' }));
    expect(screen.getByTestId('guide-lesson-content').textContent).toContain('Как не получить замечание');
    fireEvent.click(screen.getByRole('button', { name: 'Проверить себя' }));
    expect(screen.getByTestId('guide-quiz')).toBeTruthy();
  });
});
