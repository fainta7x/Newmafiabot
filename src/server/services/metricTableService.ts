import type {DatabaseWrapper} from '../../db/index.ts';
import {METRIC_CATEGORIES,type MetricCategory,type MetricColumn,type MetricCell,type MetricTableData} from '../../shared/metricTable.ts';
import {METRICS,loadMetricRating,loadMetricScope,loadRoleRating,type MetricKey} from './metricRatingService.ts';
import {countGames} from '../../lib/russianPlural.ts';
import {winRatePercent} from '../../shared/stats.ts';
const KEYS:Record<Exclude<MetricCategory,'roles'>,MetricKey[]>={
 results:['games','wins','win_rate','best_streak','elo_gain'],
 accuracy:['votes_accuracy','nominations_accuracy','sheriff_checks','don_checks','best_move_black'],
 events:['best_moves','first_killed','zero_round','zero_round_broke','zero_round_raised','critical_exits','black_misses','black_miss_rate','times_shot'],
 reveals:['sheriff_reveals','sheriff_found_black','black_reveals','black_covers','don_reveals','don_handed_reveal'],
 federation:['fed_tournaments','fed_avg_place','fed_best_place'],
};
const visible=(raw:unknown)=>{try{return JSON.parse(String(raw||'{}')).game_statistics!==false;}catch{return true;}};
export async function loadMetricTable(db:DatabaseWrapper,viewerId:string,query:{category?:string;context?:string;period?:string;format?:string}):Promise<MetricTableData>{
 const category=METRIC_CATEGORIES.find(c=>c.key===query.category)?.key||'results';
 const context=['red','black','don','mafia','sheriff','citizen'].includes(query.context||'')?query.context!:'red';
 const scope=await loadMetricScope(db,category==='federation'?{}:query);
 const options={scope,all:true};
 const base=await loadMetricRating(db,viewerId,{...query,metric:'games'},options);
 const players=scope.playerRows.filter((p:any)=>String(p.id)===viewerId||visible(p.profile_visibility_json)).map((p:any)=>({player_id:String(p.id),nickname:String(p.nickname||'Игрок'),is_me:String(p.id)===viewerId,avatar_url:base.rows.find(r=>r.player_id===String(p.id))?.avatar_url}));
 const rows=players.map(p=>({...p,games:base.rows.find(r=>r.player_id===p.player_id)?.value||0,cells:{} as Record<string,MetricCell|null>}));
 let columns:MetricColumn[]=[];
 if(category==='roles'){
  if(context==='red'||context==='black'){
   columns=[{key:'games',label:'Игры',unit:'count',hint:'Игры за выбранный цвет'},{key:'wins',label:'Победы',unit:'count',hint:'Командные победы за выбранный цвет'},{key:'win_rate',label:'Винрейт',unit:'percent',hint:'Доля побед за выбранный цвет'}];
   const counts=new Map<string,{games:number;wins:number}>();
   for(const g of scope.scoped)for(const p of g.players)if(p.team===context){const c=counts.get(p.player_id)||{games:0,wins:0};c.games++;if(p.won)c.wins++;counts.set(p.player_id,c);}
   for(const row of rows){const c=counts.get(row.player_id);row.games=c?.games||0;if(c)for(const col of columns){const value=col.key==='games'?c.games:col.key==='wins'?c.wins:winRatePercent(c.wins,c.games);row.cells[col.key]={value,text:String(value)+(col.unit==='percent'?'%':''),sample:c.games,sample_text:`${c.wins} из ${c.games} игр`};}}
  }else{
   const role=await loadRoleRating(db,viewerId,{...query,role:context},options);
   columns=[{key:'games',label:'Игры',unit:'count',hint:'Игры в выбранной роли'},{key:'wins',label:'Победы',unit:'count',hint:'Победы в выбранной роли'},{key:'win_rate',label:'Винрейт',unit:'percent',hint:'Доля побед в выбранной роли'},...role.role.columns.map(c=>({...c,unit:'count',hint:c.label+' · в выбранной роли'}))];
   for(const row of rows){const r=role.rows.find(r=>r.player_id===row.player_id);row.games=r?.games||0;if(r)for(const col of columns){const value=col.key==='games'?r.games:col.key==='wins'?r.wins:col.key==='win_rate'?r.win_rate:r.figures[col.key];if(value!=null)row.cells[col.key]={value,text:String(value)+(col.unit==='percent'?'%':''),sample:r.games,sample_text:`${r.wins} из ${r.games} игр`};}}
  }
 }else{
  const keys=KEYS[category];
  columns=keys.map(key=>{const m=METRICS.find(m=>m.key===key)!;return {key,label:m.label,hint:key==='zero_round_raised'?'Выведен вместе с другим игроком после двойного переголосования в нулевом круге':m.hint,unit:m.unit,lowerIsBetter:m.lowerIsBetter};});
  for(const key of keys){const metric=key==='games'?base:await loadMetricRating(db,viewerId,{...query,metric:key},options);for(const row of rows){const cell=metric.rows.find(r=>r.player_id===row.player_id);row.cells[key]=cell?{value:cell.value,text:cell.value_text,sample:cell.games,sample_text:cell.sample_text||countGames(cell.games)}:null;}}
 }
 const night=category==='events'?await loadMetricRating(db,viewerId,{...query,metric:'night_pairs'},options):null;
 return {category,context,columns,rows,players,filters:base.filters,games_in_scope:scope.scoped.length,source:category==='federation'?'GoMafia · подтверждённые итоги турниров; период и формат клуба не применяются.':`${base.filters.period_label} · ${base.filters.format_label}`,night_pairs:night?.rows||[]};
}
