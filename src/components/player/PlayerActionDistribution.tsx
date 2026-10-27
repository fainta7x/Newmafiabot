import type { TargetCounts } from '../../lib/gameActionFacts.ts';

/** Sheriff counts are a subset of red targets. Unknown targets remain a separate group. */
export default function PlayerActionDistribution({title,counts}:{title:string;counts:TargetCounts}) {
  const targets=[
    {label:'В красных',value:counts.red,color:'bg-rose-300'},
    {label:'В чёрных',value:counts.black,color:'bg-violet-300'},
    {label:'Роль неизвестна',value:counts.unknown,color:'bg-white/35'},
  ];
  const complete=targets.every(item=>typeof item.value==='number'&&Number.isFinite(item.value)&&item.value>=0);
  const total=complete?targets.reduce((sum,item)=>sum+item.value,0):null;
  return <section aria-label={title} className="border-t border-white/[.07] pt-3">
    <h3 className="text-sm font-semibold">{title}</h3>
    <p className="mt-2 text-xs text-white/60">{total==null?'Распределение целей':`Всего действий: ${total}`}</p>
    {total!=null&&total>0&&<div aria-hidden="true" className="mt-2 flex h-2 overflow-hidden rounded-full bg-white/10">{targets.map(item=><span key={item.label} className={item.color} style={{width:`${item.value/total*100}%`}}/>)}</div>}
    <dl className="mt-3 space-y-2 text-sm text-white/75">{targets.filter(item=>item.label!=='Роль неизвестна'||item.value!==0).map(item=><div key={item.label} className="flex items-start justify-between gap-3"><dt className="flex min-w-0 items-center gap-2"><span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${item.color}`}/>{item.label}</dt><dd className="font-semibold tabular-nums">{typeof item.value==='number'&&Number.isFinite(item.value)?item.value:'—'}</dd></div>)}</dl>
    <p className="mt-3 border-t border-white/[.07] pt-2 text-xs leading-5 text-white/55">Из красных — в шерифа: {typeof counts.sheriff==='number'&&Number.isFinite(counts.sheriff)?counts.sheriff:'—'}</p>
  </section>;
}
