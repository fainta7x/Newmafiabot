import { useCallback, useEffect, useRef, useState } from 'react';
import { getJson, sendJson, RequestJsonError } from '../../lib/requestJson.ts';
import { dailySudokuShare, formatSudokuTime, SUDOKU_LEVEL_LABEL, type DailySudokuState } from '../../shared/dailySudoku.ts';
import './dailyWord.css';
import './dailySudoku.css';

/** Daily sudoku (owner, 2026-11-16): one grid a day for the club, harder towards Sunday, 3 mistakes lose, 200 tokens. */
const API = '/api/player/daily-sudoku';
type MoveResult = DailySudokuState & { last_move: { cell: number; digit: number; ok: boolean } | null };
const message = (error: unknown) => error instanceof Error ? error.message : 'Не удалось загрузить судоку';
const rowOf = (i: number) => Math.floor(i / 9), colOf = (i: number) => i % 9;
const boxOf = (i: number) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);
const notesKey = (day: string) => `daily-sudoku-notes:${day}`;
const readNotes = (day: string): Record<number, number[]> => { try { return JSON.parse(localStorage.getItem(notesKey(day)) || '{}'); } catch { return {}; } };
const writeNotes = (day: string, notes: Record<number, number[]>) => { try { localStorage.setItem(notesKey(day), JSON.stringify(notes)); } catch { /* notes are a convenience only */ } };

function useDailySudoku() {
  const [state, setState] = useState<DailySudokuState | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const next = await getJson<DailySudokuState>(API, 'Не удалось загрузить судоку');
      if (!next || typeof next.day !== 'string') throw new Error('Не удалось загрузить судоку');
      setState(next); setError(''); return next;
    } catch (e) { setError(message(e)); return null; }
  }, []);
  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [load]);
  useEffect(() => {
    if (!state) return;
    const timer = setTimeout(() => void load(), Math.max(100, Math.min(2147483647, Date.parse(state.next_at) - Date.now() + 100)));
    return () => clearTimeout(timer);
  }, [state?.next_at, load]);
  return { state, setState, error, setError, load };
}

export function DailySudokuCard({ onOpen }: { onOpen: () => void }) {
  const { state, error, load } = useDailySudoku();
  const text = !state ? 'Одно судоку для всего клуба и награда за решение.'
    : state.status === 'won' ? `Решено за ${formatSudokuTime(state.seconds ?? 0)} · +${state.reward_earned} жетонов`
    : state.status === 'lost' ? 'Игра завершена. Завтра — новое судоку.'
    : `Сегодня ${SUDOKU_LEVEL_LABEL[state.level]} · ${state.reward} жетонов за решение`;
  return <section className="dw-card" aria-label="Судоку"><div className="dw-eyebrow">Каждый день · бесплатно</div><h2>Судоку</h2><p>{text}</p>
    {error ? <><p role="alert">{error}</p><button type="button" onClick={() => void load()}>Повторить загрузку</button></>
      : <button type="button" onClick={onOpen}>{state?.status === 'playing' ? 'Продолжить' : state?.status === 'won' || state?.status === 'lost' ? 'Мой результат' : 'Играть бесплатно'} <span aria-hidden="true">→</span></button>}
  </section>;
}

export default function PlayerDailySudoku({ onExit, onTokenBalanceChange }: { onExit: () => void; onTokenBalanceChange?: (balance: number) => void }) {
  const { state, setState, error, setError, load } = useDailySudoku();
  const [selected, setSelected] = useState<number | null>(null);
  const [notesMode, setNotesMode] = useState(false);
  const [notes, setNotes] = useState<Record<number, number[]>>({});
  const [wrong, setWrong] = useState<{ cell: number; digit: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [share, setShare] = useState('');
  const [now, setNow] = useState(Date.now());
  const inFlight = useRef(false);
  const finished = state?.status === 'won' || state?.status === 'lost';
  const playing = state?.status === 'playing';

  useEffect(() => { if (state) setNotes(readNotes(state.day)); setShare(''); setWrong(null); }, [state?.day]);
  useEffect(() => { if (!playing) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [playing]);
  useEffect(() => { if (!wrong) return; const timer = setTimeout(() => setWrong(null), 1200); return () => clearTimeout(timer); }, [wrong]);

  const board = state?.board || '';
  const givens = state?.givens || '';
  const valueAt = (i: number) => finished && state?.solution ? state.solution[i] : board[i];
  const placed = (digit: number) => [...board].filter(c => c === String(digit)).length;
  const saveNotes = (next: Record<number, number[]>) => { setNotes(next); if (state) writeNotes(state.day, next); };

  const start = async () => {
    if (!state || busy) return;
    setBusy(true); setError('');
    try { setState(await sendJson<DailySudokuState>(`${API}/start`, 'POST', { day: state.day }, 'Не удалось начать')); }
    catch (e) { if (e instanceof RequestJsonError && e.status === 409) await load(); setError(message(e)); }
    finally { setBusy(false); }
  };
  const put = async (digit: number) => {
    if (!state || !playing || selected === null || board[selected] !== '0' || inFlight.current) return;
    setError('');
    if (notesMode) {
      const own = notes[selected] || [];
      saveNotes({ ...notes, [selected]: own.includes(digit) ? own.filter(d => d !== digit) : [...own, digit].sort() });
      return;
    }
    inFlight.current = true; setBusy(true);
    const cell = selected;
    try {
      const next = await sendJson<MoveResult>(`${API}/move`, 'POST', { day: state.day, cell, digit, request_id: crypto.randomUUID() }, 'Не удалось сохранить ход');
      const { last_move, ...rest } = next;
      setState(rest); onTokenBalanceChange?.(rest.token_balance);
      if (last_move && !last_move.ok) setWrong({ cell, digit });
      else {
        // A right digit clears the notes of its cell and this digit from the notes of its row, column and box.
        const cleaned: Record<number, number[]> = {};
        for (const [key, list] of Object.entries(notes)) {
          const i = Number(key);
          if (i === cell) continue;
          cleaned[i] = rowOf(i) === rowOf(cell) || colOf(i) === colOf(cell) || boxOf(i) === boxOf(cell) ? list.filter(d => d !== digit) : list;
        }
        saveNotes(cleaned);
      }
    } catch (e) { if (e instanceof RequestJsonError && e.status === 409) await load(); setError(message(e)); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const erase = () => { if (selected !== null && notes[selected]?.length) { const { [selected]: _, ...rest } = notes; saveNotes(rest); } };

  const putRef = useRef(put); putRef.current = put;
  const eraseRef = useRef(erase); eraseRef.current = erase;
  useEffect(() => {
    // A physical keyboard (desktop): digits, arrows, Backspace for notes, «N» switches notes.
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.ctrlKey || event.metaKey || event.altKey || (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable))) return;
      const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -9, ArrowDown: 9 };
      if (event.key in moves) { event.preventDefault(); setSelected(at => { const from = at ?? 40; const to = from + moves[event.key]; return to < 0 || to > 80 || (Math.abs(moves[event.key]) === 1 && rowOf(to) !== rowOf(from)) ? from : to; }); }
      else if (/^[1-9]$/.test(event.key)) { event.preventDefault(); void putRef.current(Number(event.key)); }
      else if (event.key === 'Backspace' || event.key === 'Delete') { event.preventDefault(); eraseRef.current(); }
      else if (event.key.toLowerCase() === 'n' || event.key.toLowerCase() === 'т') setNotesMode(on => !on);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const shareResult = async () => {
    if (!state) return;
    const text = dailySudokuShare(state);
    try { if (navigator.share) await navigator.share({ text }); else if (navigator.clipboard) { await navigator.clipboard.writeText(text); setShare('Результат скопирован'); } else setShare(text); }
    catch (e) { if (!(e instanceof DOMException && e.name === 'AbortError')) setShare(text); }
  };
  const remaining = state ? Math.max(0, Math.ceil((Date.parse(state.next_at) - now) / 1000)) : 0;
  const elapsed = state?.started_at ? (finished ? state.seconds ?? 0 : (now - Date.parse(state.started_at)) / 1000) : 0;
  const selectedValue = selected !== null ? valueAt(selected) : '0';

  return <main className="dw-page sd-page" data-testid="daily-sudoku"><div className="dw-content">
    <button type="button" className="dw-back" onClick={onExit}>← Мини-игры</button>
    <header><div className="dw-eyebrow">2LA Noire · ежедневная игра</div><h1>Судоку</h1>
      <p>{state ? `Сегодня ${SUDOKU_LEVEL_LABEL[state.level]} · ${state.max_mistakes} ошибки — проигрыш · ${state.reward} жетонов за решение` : 'Загружаем сегодняшнее судоку…'}</p></header>
    {error && <div className="dw-error" role="alert"><p>{error}</p>{!state && <button type="button" onClick={() => void load()}>Повторить загрузку</button>}</div>}
    {state && <>
      <div className="dw-meta"><span>{state.day.split('-').reverse().join('.')}</span>
        {state.status !== 'new' && <span data-testid="sudoku-mistakes">Ошибки: {state.mistakes} из {state.max_mistakes}</span>}
        {state.status !== 'new' && <span data-testid="sudoku-time">Время: {formatSudokuTime(elapsed)}</span>}</div>
      {state.status === 'new' ? <section className="dw-result sd-start"><h2>Судоку на сегодня готово</h2>
        <p>Время пойдёт после нажатия «Начать». Неверная цифра — ошибка, после третьей ошибки игра на сегодня заканчивается.</p>
        <button type="button" className="sd-primary" data-testid="sudoku-start" disabled={busy} onClick={() => void start()}>{busy ? 'Открываем…' : 'Начать'}</button></section>
      : <>
        <div className="sd-grid" role="grid" aria-label="Поле судоку">{Array.from({ length: 81 }, (_, i) => {
          const value = valueAt(i);
          const given = givens[i] !== '0';
          const revealed = finished && board[i] === '0';
          const showWrong = wrong?.cell === i;
          const related = selected !== null && (rowOf(i) === rowOf(selected) || colOf(i) === colOf(selected) || boxOf(i) === boxOf(selected));
          const same = selectedValue !== '0' && value === selectedValue;
          const cls = ['sd-cell', given ? 'sd-given' : revealed ? 'sd-revealed' : value !== '0' ? 'sd-entered' : '', related ? 'sd-related' : '', same ? 'sd-same' : '', selected === i ? 'sd-selected' : '', showWrong ? 'sd-wrong' : '', colOf(i) % 3 === 2 && colOf(i) < 8 ? 'sd-edge-r' : '', rowOf(i) % 3 === 2 && rowOf(i) < 8 ? 'sd-edge-b' : ''].filter(Boolean).join(' ');
          const cellNotes = value === '0' ? notes[i] || [] : [];
          const label = `Ряд ${rowOf(i) + 1}, столбец ${colOf(i) + 1}: ${showWrong ? `${wrong!.digit} — ошибка` : value !== '0' ? value : 'пусто'}`;
          return <button type="button" role="gridcell" key={i} className={cls} aria-label={label} aria-selected={selected === i} disabled={!playing} onClick={() => setSelected(i)} data-testid={`sudoku-cell-${i}`}>
            {showWrong ? wrong!.digit : value !== '0' ? value : cellNotes.length ? <span className="sd-notes" aria-hidden="true">{Array.from({ length: 9 }, (_, d) => <span key={d}>{cellNotes.includes(d + 1) ? d + 1 : ''}</span>)}</span> : ''}
          </button>;
        })}</div>
        {playing ? <div className="sd-pad">
          <div className="sd-digits" aria-label="Цифры">{Array.from({ length: 9 }, (_, d) => {
            const digit = d + 1; const done = placed(digit) >= 9;
            return <button type="button" key={digit} data-testid={`sudoku-digit-${digit}`} disabled={busy || done} aria-label={done ? `${digit}: все расставлены` : `Цифра ${digit}`} onClick={() => void put(digit)}>{done ? '' : digit}</button>;
          })}</div>
          <div className="sd-tools">
            <button type="button" aria-pressed={notesMode} className={notesMode ? 'sd-on' : ''} data-testid="sudoku-notes" onClick={() => setNotesMode(on => !on)}>✎ Заметки: {notesMode ? 'вкл' : 'выкл'}</button>
            <button type="button" onClick={erase} disabled={selected === null || !notes[selected]?.length}>⌫ Стереть заметки</button>
          </div>
          <p className="dw-hint">{selected === null ? 'Выберите клетку, затем цифру.' : notesMode ? 'Заметки не проверяются и не считаются ошибкой.' : 'Верная цифра остаётся в клетке, неверная — ошибка.'}</p>
        </div>
        : <section className="dw-result" data-testid="sudoku-result"><h2>{state.status === 'won' ? 'Судоку решено!' : 'Три ошибки — на сегодня всё'}</h2>
          <p>{state.status === 'won' ? `Время: ${formatSudokuTime(state.seconds ?? 0)} · ошибок ${state.mistakes} из ${state.max_mistakes}. ${state.reward_earned ? `Начислено ${state.reward_earned} жетонов.` : ''}` : 'На поле показан ответ. Следующая игра будет бесплатной.'}</p>
          <p>Новое судоку через {Math.floor(remaining / 3600)} ч {Math.floor(remaining % 3600 / 60)} мин</p>
          <button type="button" onClick={() => void shareResult()}>Поделиться результатом</button>{share && <p className="dw-share" role="status">{share}</p>}</section>}
      </>}
      <details className="dw-rules"><summary>Как играть</summary>
        <p>Заполните поле цифрами от 1 до 9 так, чтобы в каждом ряду, каждом столбце и каждом квадрате 3×3 все цифры были разными. У судоку одно решение.</p>
        <p>Каждый день — одно судоку для всего клуба. В понедельник самое лёгкое, к воскресенью сложнее. Неверная цифра считается ошибкой, после третьей игра на сегодня заканчивается. Заметки карандашом не проверяются.</p>
        <p>Игра бесплатная, за решение — {state.reward} жетонов. Время идёт с нажатия «Начать». Новый день начинается в 00:00 по Москве.</p></details>
      <section className="dw-social"><h2>Сегодня в клубе</h2><p>Начали: {state.played} · Решили: {state.solved}</p><p>Моя серия: {state.streak} · Лучшая: {state.best_streak}</p>
        {finished ? state.results.length ? <ol className="sd-results">{state.results.map((r, i) => <li key={i}><span>{r.won ? `${i + 1}. ` : ''}{r.nickname}</span><strong>{r.won ? `${formatSudokuTime(r.seconds ?? 0)} · ошибок ${r.mistakes}` : 'Не решено'}</strong></li>)}</ol> : <p>Результатов пока нет.</p>
          : <p>Таблица дня откроется после завершения игры.</p>}</section>
    </>}
  </div></main>;
}
