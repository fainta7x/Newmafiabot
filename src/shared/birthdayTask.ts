import {russianPlural} from '../lib/russianPlural.ts';
/** The key records the occurrence year; never roll an overdue task over to next year's birthday. */
export function birthdayTaskTitle(task:{automation_key?:unknown;title?:unknown;player_nickname?:unknown;status?:unknown},now=Date.now()):string{
 const key=String(task.automation_key||'');const match=key.match(/^birthday:.*:(\d{4}-\d{2}-\d{2})$/);
 if(!match||task.status==='done'||task.status==='cancelled')return String(task.title||'Задача');
 const today=new Date(now).toLocaleDateString('sv-SE',{timeZone:'Europe/Moscow'});
 const days=Math.round((Date.parse(match[1]+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86_400_000);
 if(!Number.isFinite(days))return String(task.title||'Задача');
 const timing=days===0?'сегодня':days===1?'завтра':days>1?`через ${days} ${russianPlural(days,'день','дня','дней')}`:days===-1?'был вчера':`был ${-days} ${russianPlural(-days,'день','дня','дней')} назад`;
 const nick=String(task.player_nickname||String(task.title||'').split(' — ').slice(1).join(' — ')).trim();
 return `День рождения ${timing}${nick?' — '+nick:''}`;
}
