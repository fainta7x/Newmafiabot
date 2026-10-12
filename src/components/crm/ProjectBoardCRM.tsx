import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { groupByDirection, type BoardCard, type BoardStage, type BoardStatus } from '../../lib/projectBoard.ts';

type Tab = 'waiting' | 'roadmap' | 'prs';
interface Pull { number: number; title: string; url: string; colour: 'merged' | 'working' | 'ready' | 'failed' | 'closed'; author: 'claude' | 'gpt'; state: 'open' | 'merged' | 'closed'; updated_at: string; checks: { passed: number; total: number } | null }

const STAGE_LABEL: Record<Exclude<BoardStage, null>, { text: string; tone: string }> = {
  idea: { text: 'идея', tone: 'bg-violet-400/15 text-violet-200' },
  in_pr: { text: 'в PR', tone: 'bg-amber-400/15 text-amber-200' },
  check: { text: 'ждёт проверки', tone: 'bg-sky-400/15 text-sky-200' },
  merged: { text: 'слито', tone: 'bg-emerald-400/15 text-emerald-200' },
};
const STATUS_DOT: Record<BoardStatus, { text: string; tone: string }> = {
  waiting: { text: 'ждёт вас', tone: 'bg-amber-300' }, active: { text: 'в работе', tone: 'bg-sky-300' }, done: { text: 'сделано', tone: 'bg-emerald-300' }, info: { text: 'для сведения', tone: 'bg-white/30' },
};
const PR_COLOUR: Record<Pull['colour'], { dot: string; text: string }> = {
  merged: { dot: '🟢', text: 'слито' }, working: { dot: '🟡', text: 'в работе или проверке' }, ready: { dot: '🔵', text: 'проверки пройдены, ещё не слито' }, failed: { dot: '🔴', text: 'тесты не прошли' }, closed: { dot: '⚪', text: 'закрыто' },
};

const dateLabel = (value: string) => (value ? new Date(value).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }) : '');

function Card({ card, showStatus }: { card: BoardCard; showStatus?: boolean }) {
  const stage = card.stage ? STAGE_LABEL[card.stage] : null;
  return <details data-testid="project-card" className="group rounded-2xl border border-white/10 bg-white/[0.035]">
    <summary className="flex cursor-pointer list-none items-start gap-2.5 px-3 py-3">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[card.status].tone}`} aria-label={STATUS_DOT[card.status].text} />
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold leading-5 text-white">{card.title}</span>
        <span className="mt-1 block line-clamp-2 text-[12px] leading-4 text-white/45">{card.summary}</span>
        <span className="mt-1.5 flex flex-wrap gap-1.5">
          {stage ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${stage.tone}`}>{stage.text}</span> : null}
          {showStatus ? <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[11px] text-white/55">{STATUS_DOT[card.status].text}</span> : null}
        </span>
      </span>
      <span className="mt-1 shrink-0 text-white/30 transition group-open:rotate-180" aria-hidden="true">⌄</span>
    </summary>
    <div className="border-t border-white/[0.06] px-3 pb-3 pt-2.5 text-[12px] leading-5 text-white/60 whitespace-pre-wrap break-words">{card.body}</div>
  </details>;
}

function PullRow({ pull }: { pull: Pull }) {
  const colour = PR_COLOUR[pull.colour];
  return <a href={pull.url} target="_blank" rel="noreferrer" data-testid="project-pr" className="flex items-start gap-2.5 rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-3 active:bg-white/[0.06]">
    <span className="mt-0.5 text-base" role="img" aria-label={colour.text}>{colour.dot}</span>
    <span className="min-w-0 flex-1">
      <span className="block text-[14px] font-semibold leading-5 text-white"><span className="text-white/40">#{pull.number}</span> {pull.title}</span>
      <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-white/45">
        <span className="rounded-full bg-white/[0.07] px-2 py-0.5">{pull.author === 'claude' ? '🤖 Claude' : '💬 GPT'}</span>
        <span>{colour.text}{pull.checks ? ` · ${pull.checks.passed}/${pull.checks.total}` : ''}</span>
        <span>· {dateLabel(pull.updated_at)}</span>
      </span>
    </span>
  </a>;
}

/** «Проект»: a read-only view of docs/PROJECT_STATE.md by direction and status, and the pull requests (owner request 2026-10-12). */
export default function ProjectBoardCRM() {
  const [tab, setTab] = useState<Tab>('waiting');
  const [cards, setCards] = useState<BoardCard[] | null>(null);
  const [updatedAt, setUpdatedAt] = useState('');
  const [pulls, setPulls] = useState<Pull[] | null>(null);
  const [pullError, setPullError] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(''); setPullError('');
    try {
      const board = await fetch('/api/project-board', { credentials: 'include' });
      const body = await board.json().catch(() => ({}));
      if (!board.ok) throw new Error(body?.error || 'Не удалось загрузить');
      setCards(body.cards || []); setUpdatedAt(body.updated_at || '');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось загрузить'); }
    try {
      const response = await fetch('/api/project-board/pulls', { credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'GitHub недоступен');
      setPulls(body.pulls || []);
    } catch (reason) { setPulls(null); setPullError(reason instanceof Error ? reason.message : 'GitHub недоступен'); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const waiting = useMemo(() => (cards || []).filter((card) => card.status === 'waiting'), [cards]);
  const roadmap = useMemo(() => groupByDirection((cards || []).filter((card) => card.status !== 'waiting')), [cards]);
  const open = (pulls || []).filter((pull) => pull.state === 'open');
  const recent = (pulls || []).filter((pull) => pull.state !== 'open');

  const tabButton = (key: Tab, label: string, count?: number) => <button key={key} type="button" aria-pressed={tab === key} data-testid={`project-tab-${key}`} onClick={() => setTab(key)}
    className={`min-h-11 flex-1 rounded-xl px-2 text-[12px] font-semibold ${tab === key ? 'bg-white text-black' : 'bg-white/[0.07] text-white/70'}`}>{label}{count ? ` · ${count}` : ''}</button>;

  return <div data-testid="project-board" className="space-y-3">
    <div className="flex gap-1.5">{tabButton('waiting', 'Ждём вас', waiting.length)}{tabButton('roadmap', 'Дорожная карта')}{tabButton('prs', 'PR', open.length)}</div>
    <div className="flex items-center justify-between gap-2 px-1 text-[11px] text-white/35">
      <span>Источник: docs/PROJECT_STATE.md{updatedAt ? ` · файл обновлён ${dateLabel(updatedAt)}` : ''}</span>
      <button type="button" onClick={() => void load()} aria-label="Обновить" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 text-white/55"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
    </div>
    {error ? <div className="rounded-2xl border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">{error}</div> : null}

    {tab === 'waiting' ? <section aria-label="Ждём вас" className="space-y-2">
      {cards === null && !error ? <div className="rounded-2xl bg-white/[0.04] p-4 text-sm text-white/45">Загружаем…</div> : null}
      {cards && waiting.length === 0 ? <div className="rounded-2xl bg-white/[0.04] p-4 text-sm text-white/45">Сейчас от вас ничего не ждём.</div> : null}
      {waiting.map((card) => <Card key={card.id} card={card} />)}
    </section> : null}

    {tab === 'roadmap' ? <section aria-label="Дорожная карта" className="space-y-2">
      {roadmap.map((group) => {
        const active = group.cards.filter((card) => card.status === 'active').length;
        return <details key={group.direction} data-testid={`project-direction-${group.direction}`} className="group rounded-[20px] border border-white/10 bg-white/[0.025]" open={group.direction === 'game'}>
          <summary className="flex min-h-[56px] cursor-pointer list-none items-center gap-3 px-3.5 py-2.5">
            <span className="min-w-0 flex-1"><strong className="block text-[14px] font-semibold text-white">{group.label}</strong><span className="text-[12px] text-white/40">{active ? `в работе ${active} · ` : ''}всего {group.cards.length}</span></span>
            <span className="shrink-0 text-white/30 transition group-open:rotate-180" aria-hidden="true">⌄</span>
          </summary>
          <div className="space-y-2 border-t border-white/[0.06] p-2">{group.cards.map((card) => <Card key={card.id} card={card} showStatus />)}</div>
        </details>;
      })}
    </section> : null}

    {tab === 'prs' ? <section aria-label="Pull request" className="space-y-2">
      <div className="px-1 text-[11px] leading-4 text-white/35">🟢 слито · 🟡 в работе · 🔵 проверки пройдены, ещё не слито · 🔴 тесты не прошли · 🤖 Claude · 💬 GPT</div>
      {pullError ? <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">{pullError}</div> : null}
      {pulls && open.length === 0 ? <div className="rounded-2xl bg-white/[0.04] p-4 text-sm text-white/45">Открытых PR нет.</div> : null}
      {open.length ? <div className="px-1 pt-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-white/40">Ещё не слито</div> : null}
      {open.map((pull) => <PullRow key={pull.number} pull={pull} />)}
      {recent.length ? <div className="px-1 pt-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-white/40">Недавно</div> : null}
      {recent.map((pull) => <PullRow key={pull.number} pull={pull} />)}
    </section> : null}
  </div>;
}
