// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AnonymousTestamentPractice from '../components/public/guide/AnonymousTestamentPractice.tsx';
import {
  TESTAMENT_BASE_EXERCISES, STRENGTH_OPTIONS, generateAnonymousTestamentExercises,
} from '../lib/anonymousTestamentTraining.ts';
import { sanitizeLiveGameEvents } from '../shared/liveGameEvents.ts';

const example = sanitizeLiveGameEvents([
  {kind:'nomination',round:1,phase:'day_voting',seat:4,by:2},
  {kind:'vote',round:1,phase:'day_voting',seat:2,target:7},
  {kind:'best_move',round:1,phase:'night',seat:9,value:'2,5,7'},
  {kind:'vote',round:2,phase:'day_voting',seat:2,target:4},
]);
describe('automatically constructed, anonymous educational wills', () => {
  it('has all pedagogical categories and never equates a will with a proven role', () => {
    expect(TESTAMENT_BASE_EXERCISES).toHaveLength(4);
    expect(new Set(TESTAMENT_BASE_EXERCISES.map(x=>x.strength)).size).toBe(4);
    expect(STRENGTH_OPTIONS).toHaveLength(4);
    expect(TESTAMENT_BASE_EXERCISES[0].explanation).toContain('не подтверждают роль');
    expect(TESTAMENT_BASE_EXERCISES[1].explanation).toContain('не показано');
    expect(TESTAMENT_BASE_EXERCISES[3].facts.join(' ')).toContain('достоверно');
  });
  it('draws only on actions known before the event and anonymizes original seat labels and source ID', () => {
    const generated = generateAnonymousTestamentExercises([{gameKey:'club:private-876',events:example}]);
    expect(generated).toHaveLength(5);
    const lesson = generated[4];
    expect(lesson.strength).toBe('checkable_reason');
    expect(lesson.teachingWill).toContain('выставил');
    expect(lesson.teachingWill).toContain('голосовал');
    const all = JSON.stringify(generated);
    expect(all).not.toContain('private-876');
    expect(all).not.toContain('club:');
    expect(all).not.toContain('nickname');
    expect(all).not.toContain('role');
    expect(all).not.toContain('№0');
    expect(lesson.teachingWill).not.toContain('чёрный: он точно');
  });
  it('ignores corrected votes and future actions, does not invent a transcript', () => {
    const corrected = sanitizeLiveGameEvents([
      ...example.slice(0,2),
      {kind:'vote_removed',round:1,phase:'day_voting',seat:2,target:7},
      example[2],
      example[3],
    ]);
    const list = generateAnonymousTestamentExercises([{gameKey:'tournament:xy',events:corrected}]);
    expect(list[4].strength).toBe('no_reason');
    expect(list[4].facts.join(' ')).not.toContain('голосовал');
    expect(list[4].teachingWill).toContain('кажется');
    const empty = generateAnonymousTestamentExercises([],3);
    expect(empty).toHaveLength(4);
    expect(new Set(empty.map(x=>x.id)).size).toBe(4);
    expect(generateAnonymousTestamentExercises([],0)[0].id).not.toBe(empty[0].id);
  });
});
beforeEach(() => { window.localStorage.clear(); vi.restoreAllMocks(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('mobile practice', () => {
  it('withholds explanation until choice is recorded and continues to another case', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok:true, json:async()=>({cases:TESTAMENT_BASE_EXERCISES}),
    }));
    render(<AnonymousTestamentPractice onBack={()=>{}}/>);
    await waitFor(()=>expect(screen.getByTestId('anonymous-testament-case')).toBeTruthy());
    expect(screen.getByText(/реплики составлены для тренировки/)).toBeTruthy();
    expect(screen.queryByTestId('testament-explanation')).toBeNull();
    expect((screen.getByTestId('testament-check') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('testament-answer-no_reason'));
    fireEvent.click(screen.getByTestId('testament-check'));
    expect(screen.getByTestId('testament-explanation').textContent).toContain('Хороший разбор');
    fireEvent.click(screen.getByText('Следующая ситуация'));
    expect(screen.getByTestId('anonymous-testament-case').textContent).toContain('Один голос');
    expect(screen.queryByTestId('testament-explanation')).toBeNull();
    expect(JSON.parse(window.localStorage.getItem('mafia-anonymous-testament-v1') || '{}').index).toBe(1);
  });
});
