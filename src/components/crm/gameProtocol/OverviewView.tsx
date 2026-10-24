import React from 'react';
import { AlertTriangle, Check, ChevronRight, Moon, RotateCcw, Vote } from 'lucide-react';
import { Btn, Card, Eyebrow, cx } from './ui';
import type { ProtocolApi } from './types';
import { circleTitle, type Change, type CircleModel, type Issue } from './protocolReview';
import { InfoTag, NeedsTag } from './tags';
import type { ProtocolTab } from './ProtocolWindow';

type Props = {
  api: ProtocolApi;
  circles: CircleModel[];
  issues: Issue[];
  changes: Change[];
  reviewed: Record<number, boolean>;
  onToggleReviewed: (circle: number) => void;
  onGoto: (tab: ProtocolTab, target?: { circle?: number; seat?: number }) => void;
  onRevert: (change: Change) => void;
  onConfirm: () => void;
  onReopen: () => void;
  busy: boolean;
};

const winnerTitle = (team: string | null | undefined) => (team === 'red' ? 'Победа красных' : team === 'black' ? 'Победа чёрных' : 'Победитель не указан');

const circleTags = (circle: CircleModel, api: ProtocolApi, nameOf: (seat: number) => string): React.ReactNode[] => {
  const rounds = (api.protocol.votes || []).filter((round: any) => Number(round.day_number ?? 0) === circle.index) as any[];
  const out = rounds.flatMap((round) => (round.eliminated_seats || []) as number[]);
  const shot = circle.shotIndex >= 0 ? api.protocol.shots?.[circle.shotIndex] : null;
  const tags: React.ReactNode[] = [];
  if (rounds.some((round) => !round.is_revote)) tags.push(out.length ? <InfoTag key="v" tone="vote" icon={Vote}>Ушёл {out.map(nameOf).join(', ')}</InfoTag> : <InfoTag key="v" icon={Vote}>Никто не ушёл</InfoTag>);
  if (shot) tags.push(shot.result === 'killed' ? <InfoTag key="n" tone="night" icon={Moon}>Ночью {nameOf(shot.target_seat)}</InfoTag> : <InfoTag key="n" tone="night" icon={Moon}>{shot.result === 'miss' ? 'Ночью промах' : 'Ночью не договорились'}</InfoTag>);
  return tags.length ? tags : [<span key="e" className="text-[12px] text-white/40">без записей</span>];
};

export const OverviewView: React.FC<Props> = ({ api, circles, issues, changes, reviewed, onToggleReviewed, onGoto, onRevert, onConfirm, onReopen, busy }) => {
  const { protocol, results } = api;
  const votes = (protocol.votes || []) as any[];
  const votingsCount = votes.filter((round) => (round.nominated_seats || []).length > 0).length;
  const left = results.filter((player) => player.exit_type !== 'alive').length;
  const reviewedCount = circles.filter((circle) => reviewed[circle.index]).length;
  const errors = issues.filter((issue) => issue.severity === 'error');
  const confirmed = protocol.status === 'completed';

  return (
    <div className="space-y-5">
      <Card className="rounded-[28px] p-5">
        <Eyebrow>Итог игры</Eyebrow>
        <div className="mt-1.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-2xl font-semibold leading-8">{winnerTitle(protocol.winner_team)}</div>
            <div className="mt-1 text-[13px] text-white/50">{protocol.end_reason === 'ppk' ? 'Игра закончилась ППК' : 'Игра доиграна'}</div>
          </div>
          <div aria-hidden="true" className={cx('flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border text-xl font-semibold', protocol.winner_team === 'red' ? 'border-rose-300/35 bg-rose-300/[0.10] text-rose-50' : protocol.winner_team === 'black' ? 'border-white/20 bg-black/40 text-white/90' : 'border-white/10 bg-white/[0.05] text-white/40')}>
            {protocol.winner_team === 'red' ? 'К' : protocol.winner_team === 'black' ? 'Ч' : '?'}
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
          {[['Кругов', circles.length], ['Голосований', votingsCount], ['Ночей', (protocol.shots || []).length], ['Вышло из игры', left]].map(([label, value]) => (
            <div key={String(label)} className="rounded-2xl bg-black/25 px-1 py-2.5">
              <dd className="text-lg font-semibold tabular-nums leading-6">{value}</dd>
              <dt className="text-[11px] leading-4 text-white/45">{label}</dt>
            </div>
          ))}
        </dl>
      </Card>

      <section aria-labelledby="todo-title">
        <div className="mb-2 flex items-baseline justify-between px-1">
          <h2 id="todo-title" className="text-base font-semibold">Что проверить</h2>
          <span className="text-[12px] text-white/45">{issues.length ? `${issues.length}` : 'нет замечаний'}</span>
        </div>
        {issues.length === 0 ? (
          <Card tone="good" className="flex items-center gap-3 p-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-300/[0.15] text-emerald-100"><Check className="h-5 w-5" aria-hidden="true" /></span>
            <div><div className="text-sm font-semibold">Всё сходится с записью игры</div><div className="text-[12px] text-white/50">Проверьте круги ниже и подтвердите игру.</div></div>
          </Card>
        ) : (
          <ul className="space-y-2">
            {issues.map((issue) => (
              <li key={issue.id}>
                <button type="button" onClick={() => onGoto(issue.tab, { circle: issue.circle, seat: issue.seat })} className={cx('flex min-h-16 w-full items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left', issue.severity === 'error' ? 'border-rose-300/20 bg-rose-300/[0.07]' : 'border-amber-300/20 bg-amber-300/[0.07]')}>
                  <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', issue.severity === 'error' ? 'bg-rose-300/[0.15] text-rose-100' : 'bg-amber-300/[0.15] text-amber-100')}><AlertTriangle className="h-[18px] w-[18px]" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold leading-5">{issue.title}</span>
                    {issue.sub ? <span className="mt-0.5 block text-[12px] leading-4 text-white/55">{issue.sub}</span> : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-0.5 text-[13px] font-semibold text-white/60">{issue.severity === 'error' ? 'Исправить' : 'Открыть'}<ChevronRight className="h-4 w-4" aria-hidden="true" /></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="circles-title">
        <div className="mb-2 flex items-baseline justify-between px-1">
          <h2 id="circles-title" className="text-base font-semibold">Круги</h2>
          <span className="text-[12px] text-white/45">проверено {reviewedCount} из {circles.length}</span>
        </div>
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={circles.length} aria-valuenow={reviewedCount} aria-label="Проверено кругов"><div className="h-full rounded-full bg-emerald-300/80 transition-all" style={{ width: `${circles.length ? (reviewedCount / circles.length) * 100 : 0}%` }} /></div>
        <ul className="space-y-2">
          {circles.map((circle) => {
            const done = !!reviewed[circle.index];
            const hasIssue = issues.some((issue) => issue.circle === circle.index);
            return (
              <li key={circle.index} className="flex items-stretch gap-2 rounded-2xl border border-white/8 bg-white/[0.035] pr-2">
                <button type="button" onClick={() => onGoto('game', { circle: circle.index })} className="flex min-h-[68px] min-w-0 flex-1 items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-semibold">{circleTitle(circle.index)}{hasIssue ? <NeedsTag>Есть замечание</NeedsTag> : null}</span>
                    <span className="mt-1.5 flex flex-wrap gap-1">{circleTags(circle, api, (seat) => `#${seat} ${api.results.find((player) => player.seat_number === seat)?.display_name || ''}`.trim())}</span>
                  </span>
                </button>
                <button type="button" aria-pressed={done} aria-label={`${circleTitle(circle.index)}: ${done ? 'проверено' : 'отметить проверенным'}`} onClick={() => onToggleReviewed(circle.index)} className={cx('my-2 flex min-h-11 shrink-0 items-center gap-1.5 self-center rounded-xl border px-3 text-[13px] font-semibold', done ? 'border-emerald-300/25 bg-emerald-300/[0.10] text-emerald-100' : 'border-white/10 bg-white/[0.04] text-white/65')}>
                  {done ? <Check className="h-4 w-4" aria-hidden="true" /> : null}{done ? 'Проверено' : 'Проверил'}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {changes.length ? (
        <section aria-labelledby="changes-title">
          <h2 id="changes-title" className="mb-2 px-1 text-base font-semibold">Вы изменили · {changes.length}</h2>
          <ul className="space-y-2">
            {changes.map((change) => (
              <li key={change.key} className="flex items-center gap-3 rounded-2xl border border-sky-300/15 bg-sky-300/[0.05] py-2 pl-3.5 pr-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold leading-5">{change.label}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px]"><span className="text-white/45">было</span><InfoTag>{change.was}</InfoTag><span className="text-white/45">стало</span><InfoTag tone="info">{change.now}</InfoTag></div>
                </div>
                <Btn kind="ghost" disabled={api.locked} onClick={() => onRevert(change)} aria-label={`Вернуть: ${change.label}`} className="shrink-0 px-3 text-[13px]"><RotateCcw className="h-4 w-4" aria-hidden="true" />Вернуть</Btn>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="space-y-2 pt-1">
        {confirmed ? (
          <>
            <Btn kind="primary" big block onClick={onReopen} disabled={busy}>Исправить протокол</Btn>
            <p className="px-2 text-center text-[12px] text-white/45">Игра подтверждена. Чтобы что-то поправить, верните её на исправление.</p>
          </>
        ) : (
          <>
            <Btn kind="primary" big block onClick={onConfirm} disabled={busy}>Подтвердить игру</Btn>
            <p className="px-2 text-center text-[12px] text-white/45">{errors.length ? `Без исправления ${errors.length === 1 ? 'замечания' : 'замечаний'} сохранить подтверждение не получится.` : issues.length ? 'Замечания можно не исправлять: они только напоминают о том, что в игре могло остаться без отметки.' : 'Подтверждённую игру можно вернуть на исправление.'}</p>
          </>
        )}
      </div>
    </div>
  );
};
