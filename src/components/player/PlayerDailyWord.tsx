import { useCallback, useEffect, useRef, useState } from 'react';
import { getJson, sendJson, RequestJsonError } from '../../lib/requestJson.ts';
import { dailyWordShare, normalizeDailyWord, type DailyWordState, type LetterMark } from '../../shared/dailyWord.ts';
import './dailyWord.css';
const API='/api/player/daily-word';
const labels:Record<LetterMark,string>={correct:'на своём месте',present:'есть в слове',absent:'нет в слове'};
const rows=['йцукенгшщзхъ','фывапролджэ','ячсмитьбю'];
const message=(error:unknown)=>error instanceof Error?error.message:'Не удалось загрузить слово дня';
function useDailyWord(){
 const [state,setState]=useState<DailyWordState|null>(null);
 const [error,setError]=useState('');
 const load=useCallback(async()=>{try{const next=await getJson<DailyWordState>(API,'Не удалось загрузить слово дня');if(!next || !Array.isArray(next.guesses) || !Number.isInteger(next.length))throw new Error('Не удалось загрузить слово дня');setState(current=>current&&current.day===next.day&&current.guesses.length>next.guesses.length?current:next);setError('');return next;}catch(e){setError(message(e));return null;}},[]);
 useEffect(()=>{void load();const refresh=()=>{if(document.visibilityState==='visible')void load();};document.addEventListener('visibilitychange',refresh);return()=>document.removeEventListener('visibilitychange',refresh);},[load]);
 useEffect(()=>{if(!state)return;const timer=setTimeout(()=>void load(),Math.max(100,Math.min(2147483647,Date.parse(state.next_at)-Date.now()+100)));return()=>clearTimeout(timer);},[state?.next_at,load]);
 return{state,setState,error,setError,load};
}
export function DailyWordCard({onOpen}:{onOpen:()=>void}){
 const{state,error,load}=useDailyWord();
 return <section className="dw-card" aria-label="Слово дня"><div className="dw-eyebrow">Каждый день · бесплатно</div><h2>Слово дня</h2><p>{state?state.status==='won'?`Разгадано за ${state.guesses.length} из ${state.max_tries} попыток · +${state.reward_earned} жетонов`:state.status==='lost'?'Партия завершена. Завтра — новое слово.':`${state.length} букв · ${state.max_tries} попыток · ${state.reward} жетонов за победу`:'Одно слово для всего клуба и награда за разгадку.'}</p>{error?<><p role="alert">{error}</p><button type="button" onClick={()=>void load()}>Повторить загрузку</button></>:<button type="button" onClick={onOpen}>{state?.status==='playing'?`Продолжить · осталось ${state.max_tries-state.guesses.length}`:state?.status==='won'||state?.status==='lost'?'Мой результат':'Играть бесплатно'} <span aria-hidden="true">→</span></button>}</section>;
}
export default function PlayerDailyWord({onExit,onTokenBalanceChange}:{onExit:()=>void;onTokenBalanceChange?:(balance:number)=>void}){
 const{state,setState,error,setError,load}=useDailyWord();
 const[draft,setDraft]=useState('');const[busy,setBusy]=useState(false);const[answer,setAnswer]=useState('');const[share,setShare]=useState('');const[remaining,setRemaining]=useState('');
 const inFlight=useRef(false);const pending=useRef<{day:string;word:string;request_id:string;expected_count:number}|null>(null);
 const finished=state?.status==='won'||state?.status==='lost';
 useEffect(()=>{setDraft('');setAnswer('');setShare('');pending.current=null;},[state?.day]);
 useEffect(()=>{if(!state)return;const tick=()=>{const seconds=Math.max(0,Math.ceil((Date.parse(state.next_at)-Date.now())/1000));setRemaining(`${Math.floor(seconds/3600)} ч ${Math.floor(seconds%3600/60)} мин`);};tick();const timer=setInterval(tick,30000);return()=>clearInterval(timer);},[state?.next_at]);
 const submit=async()=>{
  if(!state||finished||inFlight.current)return;
  const word=normalizeDailyWord(draft);
  if(word.length!==state.length){setError(`Нужно слово из ${state.length} букв`);return;}
  inFlight.current=true;setBusy(true);setError('');
  if(!pending.current || pending.current.word!==word || pending.current.day!==state.day)pending.current={day:state.day,word,request_id:crypto.randomUUID(),expected_count:state.guesses.length};
  try{const next=await sendJson<DailyWordState>(`${API}/guess`,'POST',pending.current,'Не удалось сохранить попытку');setState({...next,can_manage:state.can_manage});onTokenBalanceChange?.(next.token_balance);pending.current=null;setDraft('');}
  catch(e){const text=message(e);if(e instanceof RequestJsonError && e.status===409){await load();setDraft('');pending.current=null;}setError(text);}
  finally{inFlight.current=false;setBusy(false);}
 };
 const type=(key:string)=>{if(busy||finished||!state)return;setError('');if(key==='⌫')setDraft(v=>v.slice(0,-1));else if(draft.length<state.length)setDraft(v=>(v+key).slice(0,state.length));};
 const marks=new Map<string,LetterMark>();
 for(const guess of state?.guesses || [])guess.marks.forEach((mark,i)=>{const old=marks.get(guess.word[i]);if(old==='correct'||(old==='present'&&mark==='absent'))return;marks.set(guess.word[i],mark);});
 const shareResult=async()=>{if(!state)return;const text=dailyWordShare(state);try{if(navigator.share)await navigator.share({text});else if(navigator.clipboard){await navigator.clipboard.writeText(text);setShare('Результат скопирован');}else setShare(text);}catch(e){if(!(e instanceof DOMException && e.name==='AbortError'))setShare(text);}};
 return <main className="dw-page" data-testid="daily-word"><div className="dw-content"><button type="button" className="dw-back" onClick={onExit}>← Мини-игры</button><header><div className="dw-eyebrow">2LA Noire · ежедневная игра</div><h1>Слово дня</h1><p>{state?`${state.length} букв · ${state.max_tries} попыток · ${state.reward} жетонов за победу`:'Загружаем сегодняшнее слово…'}</p></header>
 {error&&<div className="dw-error" role="alert"><p>{error}</p>{!state&&<button type="button" onClick={()=>void load()}>Повторить загрузку</button>}</div>}
 {state&&<><div className="dw-meta"><span>{state.day.split('-').reverse().join('.')}</span><span>Бесплатная партия</span></div>
 {!state.reward_eligible&&<p className="dw-note">Слово назначено с этого аккаунта: игра без награды и участия в сравнении.</p>}
 <div className="dw-board" aria-label="Попытки"><div className="dw-grid" style={{gridTemplateColumns:`repeat(${state.length},minmax(0,1fr))`}}>{Array.from({length:state.max_tries},(_,row)=>{const guess=state.guesses[row];const value=guess?.word || (row===state.guesses.length&&!finished?draft:'');return Array.from({length:state.length},(_,col)=><span key={`${row}-${col}`} className={`dw-cell ${guess?`dw-${guess.marks[col]}`:''}`} aria-label={value[col]?`${value[col]}${guess?`: ${labels[guess.marks[col]]}`:''}`:'Пусто'}>{value[col]||''}</span>);})}</div></div>
 {!finished?<><form onSubmit={e=>{e.preventDefault();void submit();}} className="dw-form"><label htmlFor="daily-word-input">Слово из {state.length} букв</label><input id="daily-word-input" value={draft} disabled={busy} maxLength={state.length} autoComplete="off" autoCapitalize="none" spellCheck={false} onChange={e=>{setDraft(normalizeDailyWord(e.target.value).replace(/[^а-я]/g,'').slice(0,state.length));setError('');}}/><button type="submit" disabled={busy||draft.length!==state.length}>{busy?'Сохраняем…':'Проверить слово'}</button></form>
 <div className="dw-keyboard" aria-label="Русская клавиатура">{rows.map(row=><div key={row}>{Array.from(row,key=><button type="button" key={key} className={marks.has(key)?`dw-${marks.get(key)}`:''} disabled={busy} onClick={()=>type(key)} aria-label={`Буква ${key}${marks.has(key)?`: ${labels[marks.get(key)!]}`:''}`}>{key}</button>)}</div>)}<button type="button" className="dw-delete" onClick={()=>type('⌫')} disabled={busy}>Стереть букву</button></div></>:<section className="dw-result"><h2>{state.status==='won'?'Слово разгадано!':'На сегодня попытки закончились'}</h2><p>{state.status==='won'?`Попыток: ${state.guesses.length} из ${state.max_tries}. ${state.reward_earned?`Начислено ${state.reward_earned} жетонов.`:'Партия без награды.'}`:'Следующая партия будет бесплатной.'}</p><p>Новое слово через {remaining}</p><button type="button" onClick={()=>void shareResult()}>Поделиться результатом</button>{share&&<p className="dw-share" role="status">{share}</p>}{state.status==='lost'&&(answer?<p className="dw-answer">Ответ: {answer}</p>:<button type="button" onClick={async()=>{try{const result=await sendJson<{answer:string}>(`${API}/reveal`,'POST',{day:state.day},'Не удалось открыть ответ');setAnswer(result.answer);}catch(e){setError(message(e));}}}>Показать ответ</button>)}</section>}
 <div className="dw-legend"><span><i className="dw-correct"/>На месте</span><span><i className="dw-present"/>Есть в слове</span><span><i className="dw-absent"/>Нет в слове</span></div>
 <details className="dw-rules"><summary>Как играть</summary><p>Каждый день — одно слово для всего клуба. Нужно угадать существительное в начальной форме за шесть попыток. Цвет показывает, какие буквы найдены. Буквы Е и Ё считаются одинаковыми.</p><p>Все попытки бесплатны. Награда за победу одинаковая, без бонуса за скорость. Партия сохраняется при выходе. Новый день начинается в 00:00 по Москве.</p></details>
 <section className="dw-social"><h2>Сегодня в клубе</h2><p>Начали: {state.played} · Разгадали: {state.solved}</p><p>Моя серия: {state.streak} · Лучшая: {state.best_streak}</p>{finished?state.results.length?<ul>{state.results.map((r,i)=><li key={i}><span>{r.nickname}</span><strong>{r.won?`${r.attempts}/${state.max_tries}`:'Не разгадано'}</strong></li>)}</ul>:<p>Результатов других игроков пока нет.</p>:<p>Результаты игроков откроются после завершения партии.</p>}</section>
 {state.can_manage&&<DailyWordSchedule/>}</>}
 </div></main>;
}
function DailyWordSchedule(){
 const[items,setItems]=useState<Array<{day:string;answer:string}>>([]);const[day,setDay]=useState('');const[word,setWord]=useState('');const[notice,setNotice]=useState('');const[busy,setBusy]=useState(false);
 const reload=async()=>{try{const data=await getJson<{items:typeof items}>(`${API}/schedule`,'Не удалось загрузить расписание');setItems(data.items);}catch(e){setNotice(message(e));}};
 return <details className="dw-admin" onToggle={e=>{if(e.currentTarget.open)void reload();}}><summary>Назначить слова · владелец клуба</summary><p>Можно выбрать слово на будущую дату. Без назначения слово выбирается автоматически. Назначивший слово играет без награды.</p><form onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);try{await sendJson(`${API}/schedule`,'PUT',{day,word},'Не удалось сохранить слово');setNotice('Слово сохранено');setWord('');await reload();}catch(error){setNotice(message(error));}finally{setBusy(false);}}}><label>Дата<input type="date" required value={day} onChange={e=>setDay(e.target.value)}/></label><label>Слово · 4–8 букв<input required value={word} maxLength={8} onChange={e=>setWord(e.target.value)}/></label><button type="submit" disabled={busy}>Сохранить слово</button></form>{notice&&<p role="status">{notice}</p>}<ul>{items.map(item=><li key={item.day}>{item.day}: {item.answer}</li>)}</ul></details>;
}
