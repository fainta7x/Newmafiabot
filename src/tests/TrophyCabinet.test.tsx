// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import TrophyCabinet from '../components/player/TrophyCabinet.tsx';
import { cabinetItems, isFirstPlace, type CabinetVerifiedAward } from '../lib/trophyCabinetModel.ts';

afterEach(cleanup);

const bogdanAwards: CabinetVerifiedAward[] = [
  { id:'b1',kind:'placement',title:'1 место',tournament_id:'bogdan-a',tournament_name:'Турнир Богдана 1',place_result:'1 место',award_date:'2026-08-01',verification_status:'verified' },
  { id:'b2',kind:'placement',title:'1 место',tournament_id:'bogdan-b',tournament_name:'Турнир Богдана 2',place_result:'1-е место',award_date:'2026-10-03',verification_status:'verified' },
  { id:'nom',kind:'nomination',title:'Лучший чёрный',tournament_name:'Турнир Богдана 2',verification_status:'verified' },
  { id:'second',kind:'placement',title:'2 место',tournament_name:'Другой турнир',place_result:'2 место',verification_status:'verified' },
];

describe('trophy cabinet based on existing verified profile data', () => {
  it('classifies only real first-place awards as winners, never mere participation', () => {
    expect(isFirstPlace('1 место')).toBe(true);
    expect(isFirstPlace('1-е место')).toBe(true);
    expect(isFirstPlace('11 место')).toBe(false);
    expect(isFirstPlace('21 место')).toBe(false);
    const withUnverified=[...bogdanAwards,{id:'pending',kind:'placement',title:'1 место',tournament_name:'Турнир',place_result:'1 место',verification_status:'pending'}];
    const items=cabinetItems(withUnverified,[]);
    expect(items.filter(x=>x.tournamentWinner)).toHaveLength(2);
    expect(items.filter(x=>x.category==='cups')).toHaveLength(2);
    expect(items.filter(x=>x.category==='medals')).toHaveLength(1);
    expect(items.filter(x=>x.category==='nominations')).toHaveLength(1);
    expect(items.some(x=>x.id==='award:pending')).toBe(false);
  });

  it('a different player has no phantom Bogdan cup without an award', () => {
    const other=cabinetItems([bogdanAwards[2]],[]);
    expect(other.filter(x=>x.category==='cups')).toHaveLength(0);
  });

  it('shows both real tournament trophies as 2.5D clickable objects with details, filters, and angle controls', () => {
    render(<TrophyCabinet awards={bogdanAwards} earnedAchievements={[{id:'first',name:'Первая игра',description:'Сыграть одну игру',earned_at:'2026-10-01'}]} />);
    const room=screen.getByTestId('trophy-cabinet');
    expect(screen.getAllByTestId('cabinet-exhibit')).toHaveLength(2);
    expect(screen.getByText('Турнир Богдана 1')).toBeDefined();
    expect(screen.getByText('Турнир Богдана 2')).toBeDefined();
    fireEvent.click(screen.getAllByRole('button',{name:'Открыть награду: 1 место'})[0]);
    expect(screen.getByTestId('cabinet-details')).toBeDefined();
    expect(within(screen.getByTestId('cabinet-details')).getByText('1 место · победитель турнира')).toBeDefined();
    fireEvent.click(screen.getByRole('button',{name:'Закрыть сведения'}));
    fireEvent.click(screen.getByRole('button',{name:'Повернуть витрину вправо'}));
    expect(screen.getByTestId('cabinet-3d-stage').querySelector('.trophy-cabinet__viewport')?.getAttribute('style')).toContain('8deg');
    fireEvent.click(screen.getByTestId('cabinet-filter-achievements'));
    expect(screen.getAllByTestId('cabinet-exhibit')).toHaveLength(1);
    expect(screen.getByText('Первая игра')).toBeDefined();
    fireEvent.click(screen.getByTestId('cabinet-filter-medals'));
    expect(screen.getByText('Другой турнир')).toBeDefined();
    expect(room.querySelector('.trophy-cabinet__wall--back')).not.toBeNull();
  });

  it('renders an honest empty room, not preloaded imaginary awards', () => {
    render(<TrophyCabinet awards={[]} earnedAchievements={[]} />);
    expect(screen.getByTestId('cabinet-empty').textContent).toContain('Кубков пока нет');
    expect(screen.queryByTestId('cabinet-exhibit')).toBeNull();
  });

  it('paginates when a player has earned more than six cup awards', () => {
    const cups=Array.from({length:7},(_,i)=>({
      id:'cup-'+i,kind:'placement',title:'1 место',place_result:'1 место',
      tournament_id:'event-'+i,tournament_name:'Турнир '+i,verification_status:'verified',
    }));
    render(<TrophyCabinet awards={cups} earnedAchievements={[]} />);
    expect(screen.getAllByTestId('cabinet-exhibit')).toHaveLength(6);
    fireEvent.click(screen.getByRole('button',{name:'Следующая полка'}));
    expect(screen.getAllByTestId('cabinet-exhibit')).toHaveLength(1);
  });
});
