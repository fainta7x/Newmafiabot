import type {DatabaseWrapper} from '../../db/index.ts';
export type EveningDebt={evening_id:string;title:string;starts_at:string;amount_due:number;amount_paid:number;extension_due:number;owed:number};
export type PlayerEveningDebt={player_id:string;nickname:string;owed:number;evenings:EveningDebt[]};
/** The payment rows remain the accounting owner; this is only a grouped read projection. */
export async function loadPlayerEveningDebts(db:DatabaseWrapper):Promise<PlayerEveningDebt[]>{
 const rows=await db.all<any>(`SELECT ep.player_id,p.nickname,e.id AS evening_id,e.title,e.starts_at,
  ep.amount_due,ep.amount_paid,ep.extension_due
  FROM evening_participants ep JOIN players p ON p.id=ep.player_id JOIN game_evenings e ON e.id=ep.evening_id
  WHERE ep.attendance_status='attended' AND COALESCE(ep.payment_status,'')<>'waived'
  AND COALESCE(ep.amount_due,0)>COALESCE(ep.amount_paid,0) AND (e.status='completed' OR e.settled_at IS NOT NULL)
  ORDER BY datetime(e.starts_at) DESC,e.id,p.nickname COLLATE NOCASE`);
 const groups=new Map<string,PlayerEveningDebt>();
 for(const r of rows){const id=String(r.player_id);const g=groups.get(id)||{player_id:id,nickname:String(r.nickname||'Игрок'),owed:0,evenings:[]};const owed=Math.round(Number(r.amount_due)-Number(r.amount_paid));g.owed+=owed;g.evenings.push({evening_id:String(r.evening_id),title:String(r.title||'Игровой вечер'),starts_at:String(r.starts_at),amount_due:Number(r.amount_due),amount_paid:Number(r.amount_paid),extension_due:Number(r.extension_due||0),owed});groups.set(id,g);}
 return [...groups.values()].sort((a,b)=>b.owed-a.owed||a.nickname.localeCompare(b.nickname,'ru'));
}
export const debtRubles=(n:number)=>`${Math.round(n).toLocaleString('ru-RU')} ₽`;
export const debtEveningLabel=(e:EveningDebt)=>`${e.title} · ${new Date(e.starts_at).toLocaleDateString('ru-RU',{day:'numeric',month:'long',timeZone:'Europe/Moscow'})}`;
export const playerDebtBreakdown=(p:PlayerEveningDebt)=>p.evenings.map(e=>`${debtEveningLabel(e)} — ${debtRubles(e.owed)}`).join('; ');
