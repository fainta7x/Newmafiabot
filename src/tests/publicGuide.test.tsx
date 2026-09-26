// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PublicGuide, guideTabFromSearch } from '../components/public/PublicGuide.tsx';
import { GLOSSARY, ROLES, SCENARIO, SIMPLE_RULES, TABLE_RULES, searchGlossary } from '../lib/clubGuide.ts';
import { GUIDE_ENTRIES, GUIDE_LESSONS, GUIDE_SHELVES, pluralRu } from '../lib/guideCatalog.ts';

afterEach(cleanup);

describe('public guide for novices', () => {
  it('opens the requested section from the link', () => {
    expect(guideTabFromSearch('')).toBe('home');
    expect(guideTabFromSearch('?tab=evening')).toBe('evening');
    expect(guideTabFromSearch('?tab=roles')).toBe('roles');
    expect(guideTabFromSearch('?tab=rules')).toBe('rules');
    expect(guideTabFromSearch('?tab=glossary')).toBe('glossary');
    expect(guideTabFromSearch('?tab=quiz')).toBe('quiz');
    expect(guideTabFromSearch('?tab=lessons')).toBe('lessons');
    expect(guideTabFromSearch('?tab=split')).toBe('split');
    expect(guideTabFromSearch('?tab=trainers')).toBe('trainers');
    expect(guideTabFromSearch('?tab=nope')).toBe('home');
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

  it('opens sections from the home screen and comes back', async () => {
    render(<PublicGuide />);
    expect(screen.getByTestId('guide-sections')).toBeTruthy();
    fireEvent.click(screen.getByTestId('guide-section-reference'));
    fireEvent.click(screen.getByTestId('guide-tab-evening'));
    expect(screen.getAllByTestId('guide-step')).toHaveLength(SCENARIO.length);
    expect(screen.getByTestId('guide-place').textContent).toBe('Справочник');
    fireEvent.click(screen.getByTestId('guide-back'));
    expect(await screen.findByTestId('guide-shelf-reference')).toBeTruthy();

    fireEvent.click(screen.getByTestId('guide-tab-roles'));
    expect(screen.getAllByTestId('guide-role')).toHaveLength(ROLES.length);
    // One role at a time: the chosen card shows its task.
    expect(screen.getAllByText('Задача:')).toHaveLength(1);
    fireEvent.click(screen.getAllByTestId('guide-role')[1]);
    expect(screen.getByTestId('guide-role-card').textContent).toContain(ROLES[1].task);
    fireEvent.click(screen.getByTestId('guide-back'));

    fireEvent.click(await screen.findByTestId('guide-tab-rules'));
    // A novice sees plain words first; the club terms are one tap away. Topics open on tap.
    expect(screen.getByText('Как тут наказывают')).toBeTruthy();
    expect(screen.queryByText(/ППК/)).toBeNull();
    fireEvent.click(screen.getByTestId('guide-rules-detailed'));
    for (const topic of screen.getAllByTestId('guide-rule')) {
      const toggle = topic.querySelector('button')!;
      if (toggle.getAttribute('aria-expanded') !== 'true') fireEvent.click(toggle);
      if (screen.queryAllByText(/ППК/).length) break;
    }
    expect(screen.getAllByText(/ППК/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId('guide-back'));

    fireEvent.click(await screen.findByTestId('guide-tab-glossary'));
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

  it('offers a linked learning route and remembers what was read', () => {
    window.localStorage.clear();
    render(<PublicGuide initialTab="lessons" />);
    expect(screen.getAllByTestId('guide-lesson')).toHaveLength(4);
    fireEvent.click(screen.getAllByTestId('guide-lesson')[0]);
    expect(screen.getByTestId('guide-lesson-content').textContent).toContain('Подтверждение организатора не нужно');
    fireEvent.click(screen.getByRole('button', { name: /Следующий урок/ }));
    expect(screen.getAllByTestId('guide-role')).toHaveLength(ROLES.length);
    fireEvent.click(screen.getByRole('button', { name: /Следующий урок/ }));
    expect(screen.getByTestId('guide-lesson-content').textContent).toContain('Голосование');
    fireEvent.click(screen.getByRole('button', { name: /Следующий урок/ }));
    expect(screen.getByTestId('guide-lesson-content').textContent).toContain('Как не получить замечание');
    fireEvent.click(screen.getByRole('button', { name: /Проверить себя/ }));
    expect(screen.getByTestId('guide-quiz')).toBeTruthy();
    cleanup();

    // The home screen shows the progress and offers the next step.
    render(<PublicGuide />);
    expect(screen.getByText('Пройдено 4 из 5')).toBeTruthy();
    expect(screen.getByTestId('guide-continue').textContent).toContain('Проверить себя');
  });

  it('keeps the catalog consistent so new lessons, articles and trainers slot in', () => {
    const ids = [...GUIDE_ENTRIES.map((entry) => entry.id), 'home', 'lessons'];
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(GUIDE_LESSONS.map((lesson) => lesson.id)).size).toBe(GUIDE_LESSONS.length);
    for (const entry of GUIDE_ENTRIES) {
      expect(GUIDE_SHELVES.map((shelf) => shelf.id)).toContain(entry.shelf);
      if (entry.view === 'article') expect(entry.blocks?.length).toBeGreaterThan(0);
    }
    for (const lesson of GUIDE_LESSONS) {
      if (lesson.content.kind === 'blocks') expect(lesson.content.blocks.length).toBeGreaterThan(0);
    }
    expect([1, 2, 5, 11, 22].map((count) => pluralRu(count, 'часть', 'части', 'частей'))).toEqual(['часть', 'части', 'частей', 'частей', 'части']);
  });

  it('opens an article from its shelf and groups a long topic', () => {
    render(<PublicGuide />);
    fireEvent.click(screen.getByTestId('guide-section-articles'));
    fireEvent.click(screen.getByTestId('guide-tab-split-article'));
    expect(screen.getByTestId('guide-article').textContent).toContain('Как делают попил');
    cleanup();
    render(<PublicGuide initialTab="rules" />);
    // The six «попил» parts are one topic in the rules, not six separate ones.
    const topics = screen.getAllByTestId('guide-rule').map((topic) => topic.textContent || '');
    expect(topics.filter((text) => text.includes('Попил в первый день'))).toHaveLength(1);
  });

  it('puts every section on the first screen and the trainers two taps away', () => {
    window.localStorage.clear();
    render(<PublicGuide />);
    const sections = screen.getByTestId('guide-sections');
    for (const id of ['lessons', ...GUIDE_SHELVES.map((shelf) => shelf.id)]) expect(sections.querySelector(`[data-testid="guide-section-${id}"]`)).toBeTruthy();
    // The sections come before the novice path, so a returning player does not scroll past the lessons.
    expect(sections.compareDocumentPosition(screen.getByTestId('guide-continue')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId('guide-section-trainers').textContent).toContain('Попил');

    fireEvent.click(screen.getByTestId('guide-section-trainers'));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Тренажёры');
    expect(screen.getByText('Голосование и попил')).toBeTruthy();
    fireEvent.click(screen.getByTestId('guide-tab-split-three'));
    expect(screen.getByTestId('split-three-training')).toBeTruthy();
    // The other trainers of the section are right below, no need to go back.
    const more = screen.getByTestId('guide-more');
    expect(more.textContent).toContain('Попил в нулевом круге');
    expect(more.textContent).not.toContain('Попил на троих');
    cleanup();

    // The home screen remembers the last trainer.
    render(<PublicGuide />);
    expect(screen.getByTestId('guide-recent').textContent).toContain('Попил на троих');
  });

  it('goes up to the section when a trainer link was opened directly', () => {
    render(<PublicGuide initialTab="split" />);
    fireEvent.click(screen.getByTestId('guide-back'));
    expect(screen.getByTestId('guide-shelf-trainers')).toBeTruthy();
    fireEvent.click(screen.getByTestId('guide-back'));
    expect(screen.getByTestId('guide-sections')).toBeTruthy();
  });
});
