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
  return <li data-testid={'game-reveal-claim-' + candidate.claimant} className="min-w-0 border-b border-white/10 py-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-sm font-semibold">{candidate.label} · заявил роль шерифа</h3><span className="text-xs text-white/55">{candidate.role === 'sheriff' ? 'Настоящий шериф' : candidate.role === 'mafia' || candidate.role === 'don' ? 'Чёрная команда' : candidate.role === 'citizen' ? 'Мирный' : 'Роль не записана'}</span></div>
    <div className="mt-2 space-y-2">{candidate.checks.length ? candidate.checks.map((check,index) => {
      const lie = check.trueTeam !== null && check.trueTeam !== check.color;
      return <div key={check.target+':'+index} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm"><span className="text-white/75">{check.nickname}</span><span className={check.color === 'black'?'text-violet-200':'text-rose-200'}>назвал {check.color === 'black'?'чёрным':'красным'}</span>{check.trueTeam !== null && <span className="text-xs text-white/55">{lie?'неправда':'совпало'}</span>}</div>;
    }) : <p className="text-xs text-white/55">Проверок не объявлял.</p>}</div>
    <p className="mt-2 text-xs leading-5 text-white/50">Это заявления за столом, а не записи ночных проверок.</p>
  </li>;
}

export function VersionDuelScene({ versions }: { versions: Array<{
  claimant: number; label: string; blacks: number[]; reds: number[]; state: 'verified' | 'false' | 'unknown';
}> }) {
  return <div data-testid="game-reveal-versions" className="mt-4 border-t border-white/10 pt-3">
    <h3 className="text-sm font-semibold">Две версии стола</h3>
    <p className="mt-1 text-xs leading-5 text-white/55">В каждой версии чёрные — названные игроки и тот, кто вскрылся против этого шерифа. Подтверждение возможно, когда настоящие роли известны.</p>
    <div className="mt-3 grid gap-4 sm:grid-cols-2">{versions.map((v,index) => <article key={v.claimant} className="min-w-0 border-l-2 border-white/15 pl-3">
      <p className="text-xs text-white/55">Версия {index+1}</p><h4 className="mt-1 text-sm font-semibold">Шериф — {v.label}</h4>
      {v.state !== 'unknown' && <p className={'mt-1 text-xs '+(v.state==='verified'?'text-emerald-200':'text-rose-200')}>{v.state==='verified'?'верная версия':'ложная версия'}</p>}
      <p className="mt-2 text-xs leading-5 text-violet-200">Чёрные: {v.blacks.length?v.blacks.map(n=>'#'+n).join(', '):'—'}</p>
      {!!v.reds.length && <p className="mt-1 text-xs leading-5 text-rose-200">Красные: {v.reds.map(n=>'#'+n).join(', ')}</p>}
    </article>)}</div>
  </div>;
}
