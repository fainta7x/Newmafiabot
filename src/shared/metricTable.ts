export const METRIC_CATEGORIES = [
  {key:'results',label:'Результаты'}, {key:'roles',label:'Команды и роли'},
  {key:'accuracy',label:'Меткость'}, {key:'events',label:'События игры'},
  {key:'reveals',label:'Вскрытия'}, {key:'federation',label:'Федерация'},
] as const;
export type MetricCategory = typeof METRIC_CATEGORIES[number]['key'];
export type MetricColumn = {key:string;label:string;hint:string;unit:string;lowerIsBetter?:boolean};
export type MetricCell = {value:number;text:string;sample:number;sample_text:string};
export type MetricPlayer = {player_id:string;nickname:string;avatar_url?:string|null;is_me:boolean};
export type MetricTableRow = MetricPlayer & {games:number;cells:Record<string,MetricCell|null>};
export type MetricFilters = {period:string;format:string;period_label:string;format_label:string;seasons:Array<{key:string;label:string}>;formats:Array<{key:string;label:string}>};
export type MetricTableData = {
 category:MetricCategory;context:string;columns:MetricColumn[];rows:MetricTableRow[];players:MetricPlayer[];
 filters:MetricFilters;games_in_scope:number;source:string;
 night_pairs:Array<{player_id:string;nickname:string;partner_id?:string;partner_nickname?:string;value_text:string;sample_text?:string|null}>;
};
export function sortMetricRows(rows:MetricTableRow[],key:string,direction:'asc'|'desc'){
 return [...rows].sort((a,b)=>{
  const av=a.cells[key]?.value,bv=b.cells[key]?.value;
  if(av==null||bv==null)return av==null&&bv==null?a.nickname.localeCompare(b.nickname,'ru'):av==null?1:-1;
  return (direction==='asc'?av-bv:bv-av)||b.games-a.games||a.nickname.localeCompare(b.nickname,'ru');
 });
}
export function metricDifference(a:MetricCell|null|undefined,b:MetricCell|null|undefined,unit:string){
 if(!a||!b)return 'Нет общего значения';
 const diff=b.value-a.value;const text=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(Math.abs(diff));
 return `${diff>0?'+':diff<0?'−':''}${text}${unit==='percent'?' п.п.':''}`;
}
