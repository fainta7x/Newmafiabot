/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import PlayerEloJourney from '../components/player/PlayerEloJourney.tsx';
const outcome = {expected_percent:30,elo_delta:8,team_delta:8,carry_modifier:1};
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('puts actual changes before the optional forecast and opens the exact saved calculation and game', async()=>{
 const open=vi.fn();
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({player:{id:'me',nickname:'Игрок',elo:1508,seed:1500},summary:{games:1,current:1508,computed_current:1508,peak:1508,floor:1500,net:8,last_delta:8},preview:{basis:'Сохранённая оценка',red:{win:outcome,loss:{...outcome,elo_delta:-8}},black:{win:outcome,loss:{...outcome,elo_delta:-8}}},events:[{id:'club:42',source:'club',date:'2025-10-27T21:30:00Z',title:'Пятничный вечер',game_number:42,team:'red',won:true,elo_before:1500,elo_after:1508,elo_delta:8,expected_percent:30,explanation:{headline:'Сохранённый расчёт',details:['Личный вклад +3'],formula:'5 + 3 = 8'}}]}),{headers:{'Content-Type':'application/json'}})));
 render(<PlayerEloJourney onOpenGame={open}/>);
 const history=await screen.findByRole('heading',{name:'История изменений'});
 const forecast=screen.getByText('Что если следующая игра?').closest('details')!;
 expect(history.compareDocumentPosition(forecast)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 expect(forecast.open).toBe(false);
 const game=screen.getByRole('button',{name:/Пятничный вечер · №42/});
 expect(game.textContent).toMatch(/28 окт.*2025/);
 fireEvent.click(game);
 expect(game.getAttribute('aria-expanded')).toBe('true');
 expect(screen.getByText('5 + 3 = 8')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:/Открыть протокол/}));
 expect(open).toHaveBeenCalledWith('club:42');
});
