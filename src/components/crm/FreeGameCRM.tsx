import { useEffect, useState } from 'react';
import JudgeTestGameModal from '../player/JudgeTestGameModal.tsx';
import { clearParkedFreeGame, readParkedFreeGame, recoverInterruptedTestGameSandbox, rememberRunningFreeGame } from '../../lib/testGameSandbox.ts';

/**
 * «Игра без вечера» (owner, 2026-11-18: «просто создать игру отдельно… выбрать… кто судья кто играет и запустить её в
 * движке… мне не нужны рейтинги, регистрации… можно даже не сохранять»). The full live engine — seating, the virtual
 * deal on the phone or physical cards, manual roles, nights and votes — for any 8–10 people, nothing saved: no
 * evening, no Elo, no statistics, no messages. The names stay on this device for the next time.
 * The game does not get lost (owner, 2026-11-18: «нужно чтобы она не закрывалась»): while it runs Telegram asks before
 * closing, and a game closed anyway (the window, the app, a swipe) is offered back with «Продолжить игру».
 */
type TelegramClosing = { enableClosingConfirmation?: () => void; disableClosingConfirmation?: () => void };
const askBeforeClosing = (on: boolean) => {
  try {
    const app = (window as unknown as { Telegram?: { WebApp?: TelegramClosing } }).Telegram?.WebApp;
    if (on) app?.enableClosingConfirmation?.(); else app?.disableClosingConfirmation?.();
  } catch { /* not inside Telegram */ }
};
const STORAGE_KEY = 'free-game:lineup:v1';
const MAX = 10;
type Saved = { judge: string; names: string[] };
const readSaved = (): Saved => {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as Saved | null;
    if (value && Array.isArray(value.names)) return { judge: String(value.judge || ''), names: Array.from({ length: MAX }, (_, index) => String(value.names[index] || '')) };
  } catch { /* nothing saved */ }
  return { judge: '', names: Array(MAX).fill('') };
};

export default function FreeGameCRM() {
  const [saved] = useState(readSaved);
  const [judge, setJudge] = useState(saved.judge);
  const [names, setNames] = useState<string[]>(saved.names);
  const [seats, setSeats] = useState<8 | 9 | 10>(() => {
    const filled = saved.names.filter((name) => name.trim()).length;
    return filled === 8 || filled === 9 ? filled : 10;
  });
  const [running, setRunning] = useState<{ judge: string; lineup: string[]; resume: boolean } | null>(null);
  const [round, setRound] = useState(0);
  // After the app was killed mid-game the sandbox is still marked: finish its recovery first (it parks the game), then read.
  const [parked, setParked] = useState(() => { recoverInterruptedTestGameSandbox(); return readParkedFreeGame(); });
  useEffect(() => {
    if (!running) return undefined;
    askBeforeClosing(true);
    return () => askBeforeClosing(false);
  }, [running]);

  const lineup = Array.from({ length: seats }, (_, index) => names[index]?.trim() || `Игрок ${index + 1}`);
  const duplicate = new Set(lineup.map((name) => name.toLocaleLowerCase('ru-RU'))).size !== lineup.length;
  const start = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ judge, names })); } catch { /* the game still starts */ }
    // A new game replaces a parked one.
    clearParkedFreeGame();
    setParked(null);
    const judgeName = judge.trim() || 'Ведущий';
    rememberRunningFreeGame(judgeName, lineup);
    setRunning({ judge: judgeName, lineup, resume: false });
  };
  const resumeParked = () => {
    if (!parked) return;
    rememberRunningFreeGame(parked.judge || 'Ведущий', parked.lineup);
    setRunning({ judge: parked.judge || 'Ведущий', lineup: parked.lineup, resume: true });
  };
  const shuffleSeats = () => {
    const people = names.slice(0, seats);
    for (let i = people.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [people[i], people[j]] = [people[j], people[i]];
    }
    setNames([...people, ...names.slice(seats)]);
  };

  if (running) {
    return <JudgeTestGameModal
      key={round}
      judge={{ id: '', nickname: running.judge }}
      lineup={running.lineup}
      free
      resume={running.resume}
      badge={<span className="shrink-0 rounded-full border border-sky-300/25 bg-sky-300/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.04em] text-sky-200 md:px-2 md:text-[10px] md:tracking-[0.08em]">Без вечера<span className="hidden md:inline"> · не сохраняется</span></span>}
      onClose={(completed) => {
        setRunning(null);
        setRound((value) => value + 1);
        // The window closing parks the game; a finished game is not offered again (cleared after the sandbox ends).
        window.setTimeout(() => {
          if (completed) clearParkedFreeGame();
          setParked(readParkedFreeGame());
        }, 0);
      }}
    />;
  }

  return <div className="mx-auto w-full max-w-2xl space-y-4" data-testid="free-game-crm">
    <p className="text-[13px] leading-5 text-text-secondary">Обычная игра в игровом движке без вечера и клуба: рассадка, раздача ролей (виртуальная на телефоне, физические карты или вручную), ночи, голосования. Ничего не сохраняется — ни рейтинга, ни статистики, ни сообщений игрокам. Имена запоминаются на этом устройстве до следующего раза.</p>
    {parked ? <section className="space-y-2 rounded-[16px] border border-accent/40 bg-surface-1 p-3" data-testid="free-game-parked">
      <h2 className="text-[15px] font-bold">Незаконченная игра</h2>
      <p className="text-[13px] leading-5 text-text-secondary">Ведущий {parked.judge || 'Ведущий'} · {parked.lineup.length} игроков: {parked.lineup.join(', ')}</p>
      <button type="button" onClick={resumeParked} data-testid="free-game-resume" className="min-h-12 w-full rounded-[14px] bg-accent text-[14px] font-bold text-white">Продолжить игру</button>
      <button type="button" onClick={() => { clearParkedFreeGame(); setParked(null); }} data-testid="free-game-discard" className="min-h-11 w-full rounded-[12px] border border-border-soft px-3 text-[13px] font-semibold">Удалить эту игру</button>
    </section> : null}
    <section className="space-y-3 rounded-[16px] border border-border-soft bg-surface-1 p-3">
      <label className="block"><span className="mobile-label">Ведущий</span>
        <input className="mobile-field mt-1" value={judge} onChange={(e) => setJudge(e.target.value)} placeholder="Ведущий" maxLength={40} data-testid="free-game-judge" />
      </label>
      <div>
        <span className="mobile-label">Игроков за столом</span>
        <div role="radiogroup" aria-label="Игроков за столом" className="mt-1 grid grid-cols-3 gap-2">
          {([10, 9, 8] as const).map((count) => <button key={count} type="button" role="radio" aria-checked={seats === count} onClick={() => setSeats(count)}
            className={`min-h-11 rounded-xl border text-[14px] font-bold ${seats === count ? 'border-accent bg-accent text-white' : 'border-border-soft bg-surface-2 text-text-primary'}`}>{count}</button>)}
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <span className="mobile-label">Игроки по местам</span>
          <button type="button" onClick={shuffleSeats} className="min-h-10 rounded-xl border border-border-soft px-3 text-[12px] font-semibold" data-testid="free-game-shuffle">Перемешать места</button>
        </div>
        {Array.from({ length: seats }, (_, index) => <label key={index} className="flex items-center gap-2">
          <span className="w-6 shrink-0 text-right text-[13px] font-bold text-text-secondary">{index + 1}</span>
          <input className="mobile-field" value={names[index] || ''} maxLength={30} placeholder={`Игрок ${index + 1}`} aria-label={`Место ${index + 1}`}
            onChange={(e) => setNames((current) => current.map((name, at) => (at === index ? e.target.value : name)))} data-testid={`free-game-seat-${index + 1}`} />
        </label>)}
        <p className="text-[12px] text-text-secondary">Пустое место будет «Игрок N».</p>
      </div>
      {duplicate ? <p role="alert" className="rounded-[12px] bg-danger-soft px-3 py-2 text-[13px] text-danger">Два одинаковых имени — поправьте, чтобы не перепутать игроков.</p> : null}
      <button type="button" disabled={duplicate} onClick={start} data-testid="free-game-start" className="min-h-12 w-full rounded-[14px] bg-accent text-[14px] font-bold text-white disabled:opacity-40">{parked ? 'Начать новую игру' : 'Начать игру'}</button>
      {names.some((name) => name.trim()) || judge ? <button type="button" onClick={() => { setNames(Array(MAX).fill('')); setJudge(''); try { localStorage.removeItem(STORAGE_KEY); } catch { /* nothing saved */ } }}
        className="min-h-11 w-full rounded-[12px] px-3 text-[13px] text-text-secondary">Очистить имена</button> : null}
    </section>
  </div>;
}
