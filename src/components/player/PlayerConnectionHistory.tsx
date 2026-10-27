import {formatMoscowDate} from '../../lib/moscowDate.ts';
import {openPlayerGame} from './playerProfileNavigation.ts';

export type SharedConnectionGame={id:string;title:string;game_number:number;played_at:string;same_team:boolean;won_together:boolean};

const context=(game:SharedConnectionGame)=>game.same_team===false?'Друг против друга':game.same_team!==true?'Команды не указаны':game.won_together===true?'Вместе победили':game.won_together===false?'Вместе проиграли':'В одной команде';

/** Own profile only: the caller retains its privacy gate; no extra history is fetched. */
export default function PlayerConnectionHistory({games}:{games?:SharedConnectionGame[]}) {
  if(!games?.length)return null;
  return <details className="border-t border-white/10 px-3 pb-1">
    <summary className="flex min-h-11 cursor-pointer items-center text-xs font-semibold text-white/70">Последние общие партии · {games.length}</summary>
    <ul className="divide-y divide-white/[.07]">{games.map((game,index)=>{
      const linked=/^(club|tournament):\S+$/.test(String(game.id||''));
      const content=<><span className="block break-words text-xs font-semibold leading-5">{game.title||'Игра'}{game.game_number>0?` · №${game.game_number}`:''}</span><span className="mt-1 block text-xs leading-5 text-white/60">{formatMoscowDate(game.played_at,'short',{empty:'Дата не указана'})} · {context(game)}</span></>;
      return <li key={`${game.id}:${index}`}>{linked?<a href={`/player/games/${encodeURIComponent(game.id)}`} onClick={event=>{event.preventDefault();openPlayerGame(game.id);}} className="ds-focus-ring block min-h-11 rounded-lg py-3">{content}</a>:<div className="py-3">{content}</div>}</li>;
    })}</ul>
  </details>;
}
