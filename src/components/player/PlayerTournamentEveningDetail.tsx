import { useEffect, useState } from 'react';

type TournamentRegistration = {
  status: 'confirmed' | 'reserve' | 'cancelled' | 'declined';
  response?: TournamentAnswer | null;
  queue_order?: number | null;
  payment_state?: 'unpaid' | 'pending' | 'confirmed' | 'rejected' | 'waived' | 'refunded';
  reported_amount_rub?: number | null;
  confirmed_amount_rub?: number | null;
};

type TournamentAnswer = 'play' | 'substitute' | 'thinking' | 'declined';
const ANSWERS: Array<{ id: TournamentAnswer; label: string }> = [
  { id: 'play', label: '✅ Играю' },
  { id: 'substitute', label: '🔁 Готов подменить' },
  { id: 'thinking', label: '🤔 Пока думаю' },
  { id: 'declined', label: '❌ Не смогу' },
];

type TournamentDetail = {
  id: string; title: string; date: string; venue?: string | null; judge?: string | null; lifecycle: string;
  player_capacity: number; confirmed_count: number; remaining_places: number; entry_fee_rub: number; prize_fund_rub: number;
  prize_allocations: Array<{ place: string; amount_rub: number }>; notes?: string | null; me?: TournamentRegistration | null; ineligible_reason?: 'level' | 'judge' | null;
};
const eventDate=(value:string)=>new Date(value).toLocaleString('ru-RU',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit', timeZone: 'Europe/Moscow' });
const paymentLabel=(state?:TournamentRegistration['payment_state'])=>({unpaid:'Не подтверждён',pending:'Ждёт проверки организатора',confirmed:'Оплата подтверждена',rejected:'Нужно уточнить оплату',waived:'Взнос не требуется',refunded:'Возвращено'}[state||'unpaid']);
const lifecycleLabel=(lifecycle:string,full=false)=>({registration_open:full?'Мест нет · можно встать в очередь':'Регистрация открыта',registration_closed:'Регистрация закрыта',active:'Турнир идёт',completed:'Турнир завершён',draft:'Черновик'}[lifecycle]||lifecycle);
const answerOf=(r?:TournamentRegistration|null):TournamentAnswer|null=>!r?null:r.response||(['confirmed','reserve'].includes(r.status)?'play':r.status==='cancelled'?'declined':null);
const registrationLabel=(r?:TournamentRegistration|null)=>{if(!r)return 'Вы ещё не ответили';if(r.status==='declined')return 'Регистрация отклонена организатором';if(r.status==='confirmed')return 'Играю · место за вами';const answer=answerOf(r);if(r.status==='reserve')return answer==='substitute'?'Готов подменить':`Играю · ждёте места, вы ${Number(r.queue_order||0)}-й`;return answer==='thinking'?'Пока думаю':'Не смогу';};
// Same deadlines as the server: places are paid by 3 days before; players called in later — by 24 hours before, then on site.
const payUntil=(date:string)=>{const start=new Date(date).getTime();if(!Number.isFinite(start))return 'до начала турнира';const now=Date.now(),first=start-72*3600_000,last=start-24*3600_000,fmt=(ms:number)=>new Date(ms).toLocaleString('ru-RU',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'});return now<first?`до ${fmt(first)}`:now<last?`до ${fmt(last)}`:'на месте до первой игры';};

export default function PlayerTournamentEveningDetail({tournamentId,onBack,onSaved}:{tournamentId:string;onBack:()=>void;onSaved:()=>void}) {
  const [detail,setDetail]=useState<TournamentDetail|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [reportedAmount,setReportedAmount]=useState('');
  const load=async()=>{setLoading(true);setError('');try{const response=await fetch(`/api/tournaments/evenings/${encodeURIComponent(tournamentId)}`,{credentials:'include'}),body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body?.error||'Не удалось загрузить турнир');setDetail(body as TournamentDetail);setReportedAmount((current)=>current||String(body?.me?.reported_amount_rub??body?.entry_fee_rub??''));}catch(e:any){setError(e?.message||'Не удалось загрузить турнир');}finally{setLoading(false);}};
  useEffect(()=>{void load();},[tournamentId]);
  const action=async(path:string,body?:unknown)=>{setBusy(true);setError('');try{const response=await fetch(`/api/tournaments/evenings/${encodeURIComponent(tournamentId)}${path}`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result?.error||'Не удалось выполнить действие');await load();onSaved();}catch(e:any){setError(e?.message||'Не удалось выполнить действие');}finally{setBusy(false);}};
  const me=detail?.me||null,hasFee=Number(detail?.entry_fee_rub||0)>0;
  const ineligible=detail?.ineligible_reason||null;
  const canAnswer=Boolean(detail&&!ineligible&&detail.lifecycle==='registration_open'&&me?.status!=='declined');
  const myAnswer=answerOf(me);
  // Only a confirmed player pays; a reserve player pays once a place frees up.
  const canReportPayment=Boolean(hasFee&&me&&me.status==='confirmed'&&!['confirmed','waived','pending','refunded'].includes(me.payment_state||'unpaid'));
  return <main className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-3 text-white"><div className="mx-auto max-w-[430px]">
    <button type="button" onClick={onBack} className="min-h-10 rounded-xl bg-white/[0.05] px-3 text-xs font-semibold text-white/50">← События</button>
    {error&&<div className="mt-3 rounded-2xl border border-rose-300/15 bg-rose-300/[0.07] px-3 py-3 text-sm text-rose-100">{error}</div>}
    {loading&&!detail?<div className="mt-3 rounded-2xl bg-white/[0.035] p-5 text-sm text-white/45">Загружаем турнир…</div>:null}
    {detail?<>
      <section className="mt-3 rounded-[28px] border border-violet-200/10 bg-gradient-to-br from-violet-400/[0.10] to-white/[0.035] p-4"><div className="flex items-center justify-between gap-3"><div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-violet-100/55">Турнир</div><span className="rounded-full bg-white/[0.07] px-2.5 py-1 text-[11px] font-semibold text-white/60">{lifecycleLabel(detail.lifecycle,detail.remaining_places<=0)}</span></div><h1 className="mt-2 text-2xl font-semibold leading-tight">{detail.title}</h1><p className="mt-2 text-sm leading-5 text-white/50">{eventDate(detail.date)}</p>{detail.venue?<p className="mt-1 text-sm text-white/45">📍 {detail.venue}</p>:null}{detail.judge?<p className="mt-1 text-sm text-white/45">Судья: {detail.judge}</p>:null}</section>
      <section className="mt-3 rounded-[24px] border border-white/10 bg-[#15171d] p-4"><div className="text-[11px] uppercase tracking-[0.12em] text-white/30">Моя регистрация</div><div className="mt-1 text-lg font-semibold">{registrationLabel(me)}</div>
        {me?.status==='reserve'?<div className="mt-3 rounded-xl bg-white/[0.04] px-3 py-2 text-xs leading-5 text-white/55">{myAnswer==='substitute'?'Если понадобится замена, мы напишем — место станет вашим.':'Вы в очереди на место. Если оно освободится, мы напишем.'}{hasFee?' Платить взнос нужно только после этого.':''}</div>:null}
        {me?.status==='confirmed'&&hasFee&&!['confirmed','waived','pending','refunded'].includes(me.payment_state||'unpaid')?<div className="mt-3 rounded-xl bg-amber-200/[0.07] px-3 py-2 text-xs leading-5 text-amber-50/70">Чтобы сохранить место, оплатите взнос {Number(detail.entry_fee_rub).toLocaleString('ru-RU')} ₽ {payUntil(detail.date)}. Иначе место перейдёт следующему игроку.</div>:null}
        {me&&(me.status==='confirmed'||(me.status==='reserve'&&['confirmed','pending'].includes(me.payment_state||'unpaid')))&&hasFee?<div className="mt-3 rounded-xl bg-black/20 px-3 py-3"><div className="text-[11px] uppercase tracking-[0.12em] text-white/30">Взнос</div><div className="mt-1 text-sm font-semibold">{paymentLabel(me.payment_state)}</div>{me.reported_amount_rub!=null?<div className="mt-1 text-xs text-white/45">Заявлено: {Number(me.reported_amount_rub).toLocaleString('ru-RU')} ₽</div>:null}{me.confirmed_amount_rub!=null?<div className="mt-1 text-xs text-white/45">Подтверждено: {Number(me.confirmed_amount_rub).toLocaleString('ru-RU')} ₽</div>:null}</div>:null}
        {me&&['confirmed','reserve'].includes(me.status)&&!hasFee?<div className="mt-3 rounded-xl bg-emerald-200/[0.07] px-3 py-2 text-xs leading-5 text-emerald-50/70">Турнир без вступительного взноса — отмечать оплату не нужно.</div>:null}
        {(!me||['cancelled','declined'].includes(me.status))&&detail.lifecycle!=='registration_open'?<div className="mt-3 rounded-xl bg-white/[0.04] px-3 py-2 text-xs leading-5 text-white/45">{detail.lifecycle==='registration_closed'?'Организатор закрыл регистрацию.':detail.lifecycle==='active'?'Турнир уже начался.':detail.lifecycle==='completed'?'Турнир уже завершён.':'Регистрация пока недоступна.'}</div>:null}
        {ineligible&&(!me||['cancelled','declined'].includes(me.status))?<div className="mt-3 rounded-xl bg-white/[0.04] px-3 py-2 text-xs leading-5 text-white/55">{ineligible==='judge'?'Вы судите этот турнир, поэтому записаться игроком нельзя.':'На турнир записываются игроки с турнирным уровнем. Уровень присваивает организатор — спросите его, если хотите играть турниры.'}</div>:null}
        {canAnswer?<div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="Ваш ответ на турнир" data-testid="tournament-answers">{ANSWERS.map((item)=><button key={item.id} disabled={busy} type="button" aria-pressed={myAnswer===item.id} onClick={()=>void action('/answer',{response:item.id})} className={`min-h-12 rounded-xl px-2 text-sm font-semibold disabled:opacity-50 ${myAnswer===item.id?'bg-white text-black':'border border-white/10 bg-white/[0.04] text-white/75'}`}>{item.label}</button>)}</div>:null}
        {canAnswer&&!me?<div className="mt-2 text-xs leading-5 text-white/40">«Играю» — хотите сыграть и займёте место. «Готов подменить» — выручите, если кого-то не хватит.</div>:null}
        {canReportPayment?<div className="mt-2 space-y-2"><label className="block text-[11px] uppercase tracking-[0.12em] text-white/35">Сколько вы перевели, ₽</label><input type="number" min="0" step="1" value={reportedAmount} onChange={(e)=>setReportedAmount(e.target.value)} className="min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white"/><button disabled={busy||reportedAmount===''||Number(reportedAmount)<0||!Number.isInteger(Number(reportedAmount))} type="button" onClick={()=>void action('/payment/report',{amount_rub:Number(reportedAmount)})} className="min-h-12 w-full rounded-xl bg-emerald-100 text-sm font-semibold text-emerald-950 disabled:opacity-50">Я оплатил взнос</button></div>:null}
        {me?.payment_state==='pending'&&hasFee?<div className="mt-2 rounded-xl bg-amber-200/[0.07] px-3 py-2 text-xs leading-5 text-amber-50/65">Заявка отправлена. Сумма станет подтверждённой только после проверки организатором.</div>:null}
      </section>
      <section className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-3"><div className="text-[11px] uppercase tracking-[0.12em] text-white/30">Состав</div><div className="mt-1 text-lg font-black">{detail.confirmed_count}/{detail.player_capacity}</div><div className="mt-1 text-xs text-white/40">Свободно: {detail.remaining_places}</div></div><div className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-3"><div className="text-[11px] uppercase tracking-[0.12em] text-white/30">Взнос</div><div className="mt-1 text-lg font-black">{hasFee?`${Number(detail.entry_fee_rub).toLocaleString('ru-RU')} ₽`:'Бесплатно'}</div><div className="mt-1 text-xs text-white/40">{hasFee?'Ручная проверка':'Оплата не нужна'}</div></div></section>
      {Number(detail.prize_fund_rub||0)>0?<section className="mt-3 rounded-[24px] border border-white/[0.07] bg-white/[0.035] p-4"><div className="text-[11px] uppercase tracking-[0.12em] text-white/30">Призовой фонд</div><div className="mt-1 text-xl font-black">{Number(detail.prize_fund_rub||0).toLocaleString('ru-RU')} ₽</div>{detail.prize_allocations?.length?<div className="mt-3 space-y-1.5">{detail.prize_allocations.map((item,index)=><div key={`${item.place}-${index}`} className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2 text-sm"><span className="text-white/55">{item.place}</span><b>{Number(item.amount_rub||0).toLocaleString('ru-RU')} ₽</b></div>)}</div>:null}</section>:null}
      {detail.notes?<section className="mt-3 rounded-[24px] border border-white/[0.07] bg-white/[0.025] p-4"><div className="text-[11px] uppercase tracking-[0.12em] text-white/30">Описание / правила</div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/50">{detail.notes}</p></section>:null}
    </>:null}
  </div></main>;
}
