import { Fragment } from 'react';

export type AnnouncedCheck = {
  target: number;
  nickname: string;
  color: 'red' | 'black';
  trueTeam: 'red' | 'black' | null;
};

export type RevealCandidate = {
  claimant: number;
  label: string;
  role: string | null;
  checks: AnnouncedCheck[];
};

/**
 * Visual representation of announced information, not actual night actions.
 * Actual colors are compared only when the source reports the player's team.
 */
export function RevealStatementScene({ candidate }: { candidate: RevealCandidate }) {
  return <li data-testid={'game-reveal-claim-' + candidate.claimant}
    className="relative min-w-0 overflow-hidden rounded-[26px] border border-amber-200/15 bg-gradient-to-br from-[#2c2530] via-[#1a1821] to-[#101115] p-4 sm:p-5">
    <div aria-hidden="true" className="pointer-events-none absolute -right-4 -top-8 text-[125px] text-amber-200/[.07]">♛</div>
    <div className="relative flex items-center gap-3 border-b border-amber-200/10 pb-4">
      <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-amber-200/30 bg-amber-200/[.1] text-2xl font-semibold text-amber-100">{candidate.claimant}</div>
      <div className="min-w-0 flex-1"><div className="text-[10px] font-semibold uppercase tracking-[.15em] text-amber-200/60">Заявил роль шерифа</div>
        <div className="mt-1 truncate text-sm font-semibold text-white/90">{candidate.label}</div></div>
      <span aria-hidden="true" className="text-2xl text-amber-200/50">⇢</span>
    </div>
    <div className="relative ml-5 border-l-2 border-dashed border-amber-200/20 pl-4">
      {candidate.checks.length ? candidate.checks.map((check, index) => {
        const lie = check.trueTeam !== null && check.trueTeam !== check.color;
        return <div key={check.target + ':' + index} className="relative mt-3 rounded-[18px] border border-white/10 bg-[#121319]/90 p-3">
          <span aria-hidden="true" className="absolute -left-4 top-7 w-4 border-t-2 border-dashed border-amber-200/25"/>
          <div className="flex flex-wrap items-center gap-2">
            <span className={'grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 text-base font-semibold ' +
              (check.color === 'black' ? 'border-violet-200/50 bg-violet-300/10 text-violet-100' : 'border-rose-200/50 bg-rose-300/10 text-rose-100')}>{check.target}</span>
            <div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold text-white/90">{check.nickname}</div>
              <div className="mt-1 text-[11px] text-white/65">назвал {check.color === 'black' ? 'чёрным' : 'красным'}</div></div>
            {check.trueTeam !== null && <span className={'rounded-full px-2 py-1 text-[10px] font-semibold ' +
              (lie ? 'bg-amber-300/10 text-amber-100' : 'bg-emerald-300/10 text-emerald-200')}>{lie ? 'неправда' : 'совпало'}</span>}
          </div>
          {check.trueTeam !== null && <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-white/10">
            <span className={'h-full w-full ' + (check.trueTeam === 'black' ? 'bg-violet-300/60' : 'bg-rose-300/60')}/>
          </div>}
        </div>;
      }) : <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-3 py-4 text-xs text-white/45">Проверок не объявлял.</div>}
    </div>
    <p className="relative mt-4 text-[10px] leading-4 text-white/45">Это публичные заявления за столом. Они не заменяют записи настоящих ночных проверок.</p>
  </li>;
}

export function VersionDuelScene({ versions }: { versions: Array<{
  claimant: number; label: string; blacks: number[]; reds: number[]; state: 'verified' | 'false' | 'unknown';
}> }) {
  return <div data-testid="game-reveal-versions" className="mt-4 overflow-hidden rounded-[28px] border border-amber-200/15 bg-[#121116] p-4 sm:p-5">
    <div className="text-[10px] font-semibold uppercase tracking-[.16em] text-amber-100/55">Спор за доверие</div>
    <h3 className="mt-1 text-lg font-semibold text-white/90">Две версии стола</h3>
    <p className="mt-2 text-xs leading-5 text-white/50">Если шериф он, то чёрные те, кого он назвал, и тот, кто вскрылся против него. Верна ровно одна версия, когда обе роли известны.</p>
    <div className="relative mt-4 grid gap-3 sm:grid-cols-2">
      {versions.map((v, index) => <Fragment key={v.claimant}>
        <article className={'relative overflow-hidden rounded-[24px] border p-4 ' +
          (v.state === 'verified' ? 'border-emerald-200/25 bg-gradient-to-br from-emerald-300/[.11] to-[#141c1a]' :
           v.state === 'false' ? 'border-rose-200/20 bg-gradient-to-br from-rose-300/[.08] to-[#1d1519]' :
           'border-white/10 bg-[#1a1920]')}>
          <span aria-hidden="true" className="absolute -right-4 top-0 text-[90px] leading-none text-white/[.05]">♛</span>
          <div className="relative text-[10px] text-white/55">Версия {index + 1}</div>
          <div className="relative mt-2 text-base font-semibold text-white/90">Шериф — {v.label}</div>
          {v.state !== 'unknown' && <span className={'relative mt-3 inline-block rounded-full px-2.5 py-1 text-[10px] font-semibold ' +
            (v.state === 'verified' ? 'bg-emerald-300/15 text-emerald-200' : 'bg-rose-300/15 text-rose-200')}>
            {v.state === 'verified' ? 'верная версия' : 'ложная версия'}
          </span>}
          <p className="relative mt-3 text-xs text-white/70">Чёрные: {v.blacks.length ? v.blacks.map(n => '#' + n).join(', ') : '—'}</p>
          {!!v.reds.length && <p className="relative mt-1 text-xs text-white/60">Красные: {v.reds.map(n => '#' + n).join(', ')}</p>}
          <div aria-hidden="true" className="relative mt-3 flex flex-wrap gap-1.5">{v.blacks.map(n =>
            <span key={n} className="grid h-7 w-7 place-items-center rounded-full border border-violet-200/30 bg-violet-200/10 text-xs text-violet-100">{n}</span>)}
          </div>
        </article>
      </Fragment>)}
      {versions.length === 2 && <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-200/30 bg-[#151318] px-3 py-2 text-xs font-bold text-amber-100 sm:block">VS</div>}
    </div>
  </div>;
}
