import {expect,it} from 'vitest';
import {birthdayTaskTitle} from '../shared/birthdayTask.ts';
const row={automation_key:'birthday:synthetic:2026-10-30',player_nickname:'Игрок',title:'День рождения через 5 дн. — Игрок'};
it('adapts an existing occurrence through Moscow calendar days without moving it to next year',()=>{
 for(const[date,label]of [['2026-10-25T12:00:00Z','через 5 дней'],['2026-10-28T12:00:00Z','через 2 дня'],['2026-10-28T21:01:00Z','завтра'],['2026-10-30T12:00:00Z','сегодня'],['2026-10-31T12:00:00Z','был вчера'],['2026-11-03T12:00:00Z','был 4 дня назад']])expect(birthdayTaskTitle(row,Date.parse(date))).toBe(`День рождения ${label} — Игрок`);
});
it('keeps completed, manual and malformed tasks unchanged',()=>{expect(birthdayTaskTitle({...row,status:'done'})).toBe(row.title);expect(birthdayTaskTitle({title:'Написать игроку'})).toBe('Написать игроку');expect(birthdayTaskTitle({...row,automation_key:'birthday:p:2026-99-99'})).toBe(row.title);});
