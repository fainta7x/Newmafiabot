import type {DatabaseWrapper} from '../../db/index.ts';
export type EveningDebt={evening_id:string;title:string;starts_at:string;amount_due:number;amount_paid:number;extension_due:number;owed:number};
export type PlayerEveningDebt={player_id:string;nickname:string;owed:number;evenings:EveningDebt[]};

/**
 * AR03 (2026-11-03): the ONE rule of «a player owes for an evening», for every reader — the CRM debts screen, reminders,
 * tasks, the players list and the player's wallet. A debt is a participation of a closed evening (completed or settled),
 * the player came, it is not waived (an empty status is not waived), and less was paid than is due. The payment rows
 * stay the accounting owner; this is only a read rule. `ep` and `e` are the participation and evening aliases.
 */
export const closedEveningDebtWhere=(ep='ep',e='e')=>`${ep}.attendance_status='attended' AND COALESCE(${ep}.payment_status,'')<>'waived'
  AND COALESCE(${ep}.amount_due,0)>COALESCE(${ep}.amount_paid,0) AND (${e}.status='completed' OR ${e}.settled_at IS NOT NULL)`;
/** The same rule as SQL, for one row already read (the wallet list). */
export const closedEveningDebtOwed=(row:{attendance_status?:unknown;payment_status?:unknown;amount_due?:unknown;amount_paid?:unknown;evening_status?:unknown;settled_at?:unknown}):number=>{
 const due=Number(row.amount_due||0),paid=Number(row.amount_paid||0);
 if(String(row.attendance_status||'')!=='attended'||String(row.payment_status||'')==='waived'||!(due>paid))return 0;
 if(String(row.evening_status||'')!=='completed'&&!row.settled_at)return 0;
 return Math.round(due-paid);
};

/** The payment rows remain the accounting owner; this is only a grouped read projection. */
export async function loadPlayerEveningDebts(db:DatabaseWrapper,playerId?:string):Promise<PlayerEveningDebt[]>{
 const rows=await db.all<any>(`SELECT ep.player_id,p.nickname,e.id AS evening_id,e.title,e.starts_at,
  ep.amount_due,ep.amount_paid,ep.extension_due
  FROM evening_participants ep JOIN players p ON p.id=ep.player_id JOIN game_evenings e ON e.id=ep.evening_id
  WHERE ${closedEveningDebtWhere()}${playerId?' AND ep.player_id=?':''}
  ORDER BY datetime(e.starts_at) DESC,e.id,p.nickname COLLATE NOCASE`,playerId?[playerId]:[]);
 const groups=new Map<string,PlayerEveningDebt>();
 for(const r of rows){const id=String(r.player_id);const g=groups.get(id)||{player_id:id,nickname:String(r.nickname||'Игрок'),owed:0,evenings:[]};const owed=Math.round(Number(r.amount_due||0)-Number(r.amount_paid||0));g.owed+=owed;g.evenings.push({evening_id:String(r.evening_id),title:String(r.title||'Игровой вечер'),starts_at:String(r.starts_at),amount_due:Number(r.amount_due||0),amount_paid:Number(r.amount_paid||0),extension_due:Number(r.extension_due||0),owed});groups.set(id,g);}
 return [...groups.values()].sort((a,b)=>b.owed-a.owed||a.nickname.localeCompare(b.nickname,'ru'));
}
export const debtRubles=(n:number)=>`${Math.round(n).toLocaleString('ru-RU')} ₽`;
export const debtEveningLabel=(e:EveningDebt)=>`${e.title} · ${new Date(e.starts_at).toLocaleDateString('ru-RU',{day:'numeric',month:'long',timeZone:'Europe/Moscow'})}`;
export const playerDebtBreakdown=(p:PlayerEveningDebt)=>p.evenings.map(e=>`${debtEveningLabel(e)} — ${debtRubles(e.owed)}`).join('; ');
