import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { getJson, sendJson } from '../../lib/requestJson.ts';
import {
  TELEPHONE_COLORS, TELEPHONE_MAX_LINKS, TELEPHONE_MIN_LINKS, TELEPHONE_TEXT_MAX, TELEPHONE_TURN_HOURS,
  type TelephoneChainState, type TelephoneItem, type TelephoneListState, type TelephonePlayer,
} from '../../shared/drawingTelephone.ts';
import './dailyWord.css';
import './drawingTelephone.css';

/** «Испорченный телефон с рисунками» (owner, 2026-11-16); rules in docs/BUSINESS_RULES.md. */
const API = '/api/player/telephone';
const TITLE = 'Испорченный телефон с рисунками';
const message = (error: unknown) => error instanceof Error ? error.message : 'Не удалось загрузить';
const png = (base64: string) => `data:image/png;base64,${base64}`;
/**
 * A move in progress survives an accidental close of Telegram (owner, 2026-11-16: «случайно сворачиваю телеграм и
 * перерисовываю картину заново»): the strokes and the text are kept on the phone until the move is sent, and while
 * something is drawn Telegram asks before closing.
 */
const draftKey = (chainId: string, position: number) => `telephone-draft:${chainId}:${position}`;
const readDraft = <T,>(key: string): T | null => { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : null; } catch { return null; } };
const writeDraft = (key: string, value: unknown) => { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked: drawing still works */ } };
type TelegramClosing = { enableClosingConfirmation?: () => void; disableClosingConfirmation?: () => void };
const telegramApp = () => (window as unknown as { Telegram?: { WebApp?: TelegramClosing } }).Telegram?.WebApp;
const askBeforeClosing = (on: boolean) => { try { if (on) telegramApp()?.enableClosingConfirmation?.(); else telegramApp()?.disableClosingConfirmation?.(); } catch { /* not inside Telegram */ } };
const timeLeft = (deadline: string | null) => {
  if (!deadline) return '';
  const minutes = Math.max(0, Math.round((Date.parse(deadline) - Date.now()) / 60000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} ч ${minutes % 60} мин` : `${minutes} мин`;
};

export default function PlayerDrawingTelephone({ chainId, onOpen, onExit, onTokenBalanceChange }: { chainId: string | null; onOpen: (chainId: string | null) => void; onExit: () => void; onTokenBalanceChange?: () => void }) {
  return <main className="dw-page" data-testid="drawing-telephone"><div className="dw-content">
    <button type="button" className="dw-back" onClick={() => chainId ? onOpen(null) : onExit()}>{chainId ? '← Все цепочки' : '← Мини-игры'}</button>
    {chainId ? <ChainView key={chainId} chainId={chainId} onOpen={onOpen} onMoved={onTokenBalanceChange} /> : <ListView onOpen={onOpen} onMoved={onTokenBalanceChange} />}
  </div></main>;
}

function Rules() {
  return <details className="dw-rules"><summary>Как играть</summary>
    <p>Автор пишет фразу и передаёт ход. Первый рисует фразу, следующий видит только рисунок и подписывает его, потом снова рисунок, и так по цепочке. Каждый видит только предыдущее звено.</p>
    <p>Ход можно передать любому, кто ещё не ходил в этой цепочке. На ход {TELEPHONE_TURN_HOURS} часов. Кто не успел или отказался — ход возвращается, и предыдущий выбирает другого (тоже за {TELEPHONE_TURN_HOURS} часов, иначе выбирать будет звено перед ним). Если не ответил отгадывающий, автор выбирает нового.</p>
    <p>В конце отгадывающий, которого автор выбрал сразу, видит последний рисунок и последнюю подпись и пишет, какой была исходная фраза. Потом цепочка открывается всем и уходит в «Новости».</p>
    <p>На рисунке нельзя писать буквы. В подписи нельзя слова из прошлых подписей этой цепочки — ни в какой форме («кот», «кота», «котом» — одно слово). Стартовую фразу нельзя повторять. За каждый ход — 50 жетонов.</p>
  </details>;
}

function ListView({ onOpen, onMoved }: { onOpen: (id: string | null) => void; onMoved?: () => void }) {
  const [state, setState] = useState<TelephoneListState | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const load = useCallback(async () => { try { setState(await getJson<TelephoneListState>(API, 'Не удалось загрузить цепочки')); setError(''); } catch (e) { setError(message(e)); } }, []);
  useEffect(() => { void load(); }, [load]);
  if (creating) return <CreateForm onCancel={() => setCreating(false)} onCreated={(id) => { onMoved?.(); onOpen(id); }} />;
  return <>
    <header><div className="dw-eyebrow">2LA Noire · игра по цепочке</div><h1>{TITLE}</h1><p>Фраза → рисунок → подпись → рисунок… и в конце отгадка. 50 жетонов за каждый ход.</p></header>
    {error && <div className="dw-error" role="alert"><p>{error}</p><button type="button" onClick={() => void load()}>Повторить загрузку</button></div>}
    {state && <>
      {state.my_turns.length > 0 && <section className="dw-result" data-testid="telephone-my-turns"><h2>Твой ход</h2>{state.my_turns.map((turn) =>
        <button type="button" key={turn.id} className="tp-row tp-row--accent" onClick={() => onOpen(turn.id)}>
          <span><strong>{turn.step === 'guess' ? 'Отгадать фразу' : turn.step === 'choose' ? 'Выбрать, кому передать ход' : turn.step === 'choose_guesser' ? 'Выбрать другого отгадывающего' : `Звено ${turn.position} из ${turn.length}`}</strong><small>Цепочка {turn.author}{turn.deadline_at ? ` · осталось ${timeLeft(turn.deadline_at)}` : ''}</small></span><span aria-hidden="true">→</span>
        </button>)}</section>}
      <section className="dw-result">
        {state.my_active ? <><h2>Моя цепочка идёт</h2><p>Готово звеньев: {state.my_active.done_links} из {state.my_active.length}{state.my_active.current ? ` · сейчас ход у ${state.my_active.current}` : ''}</p>
          <button type="button" onClick={() => onOpen(state.my_active!.id)}>Открыть</button></>
          : <><h2>Начать свою цепочку</h2><p>Придумайте фразу, выберите, кто будет отгадывать, и кому передать первый ход.</p>
            <button type="button" className="tp-primary" data-testid="telephone-create" onClick={() => setCreating(true)}>Начать цепочку</button></>}
      </section>
      <section className="dw-social" data-testid="telephone-running"><h2>Идут сейчас</h2>{state.running.length ? <ul className="tp-finished">{state.running.map((chain) =>
        <li key={chain.id}><button type="button" className="tp-row" onClick={() => onOpen(chain.id)}>
          <span><strong>Цепочка {chain.author}</strong><small>{stageLine(chain)}</small></span><span aria-hidden="true">→</span>
        </button></li>)}</ul> : <p>Сейчас ни одна цепочка не идёт.</p>}</section>
      <section className="dw-social"><h2>Готовые цепочки</h2>{state.finished.length ? <ul className="tp-finished">{state.finished.map((chain) =>
        <li key={chain.id}><button type="button" className="tp-row" onClick={() => onOpen(chain.id)}>
          {chain.cover ? <img src={png(chain.cover)} alt="" className="tp-thumb" /> : <span className="tp-thumb" aria-hidden="true" />}
          <span><strong>«{chain.phrase}»</strong><small>{chain.guess !== null ? `→ «${chain.guess}»` : '→ без отгадки'} · {chain.author} · {chain.length} звеньев</small></span>
        </button></li>)}</ul> : <p>Пока ни одной. Начните первую!</p>}</section>
    </>}
    <Rules />
  </>;
}

/** The stage of a running chain in plain words: which link of how many, whose turn and what he does. */
const STEP_WORDS: Record<string, string> = { guess: 'отгадывает', choose: 'выбирает, кому передать ход', choose_guesser: 'автор выбирает нового отгадывающего' };
function stageLine(chain: TelephoneListState['running'][number]) {
  const link = Math.min(chain.done_links + 1, chain.length);
  const doing = chain.step === 'move' ? (link % 2 === 1 ? 'рисует' : 'подписывает') : STEP_WORDS[chain.step || ''] || '';
  const stage = chain.step === 'guess' || chain.step === 'choose_guesser' ? `все ${chain.length} звеньев готовы` : `звено ${link} из ${chain.length}`;
  return `${stage}${chain.current ? ` · ${chain.step === 'choose_guesser' ? doing : `${chain.current} ${doing}`}` : ''}${chain.deadline_at ? ` · осталось ${timeLeft(chain.deadline_at)}` : ''}`;
}

function PlayerPicker({ label, chainId, exclude, value, onChange, testId }: { label: string; chainId: string | null; exclude: string[]; value: string; onChange: (id: string) => void; testId: string }) {
  const [players, setPlayers] = useState<TelephonePlayer[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { void getJson<{ items: TelephonePlayer[] }>(`${API}/players${chainId ? `?chain=${encodeURIComponent(chainId)}` : ''}`, 'Не удалось загрузить игроков').then((data) => setPlayers(data.items)).catch((e) => setError(message(e))); }, [chainId]);
  const list = useMemo(() => players.filter((p) => !exclude.includes(p.id) && p.nickname.toLocaleLowerCase('ru-RU').includes(query.trim().toLocaleLowerCase('ru-RU'))), [players, exclude, query]);
  const chosen = players.find((p) => p.id === value);
  return <fieldset className="tp-picker" data-testid={testId}><legend>{label}</legend>
    {chosen ? <div className="tp-chosen"><strong>{chosen.nickname}</strong><button type="button" onClick={() => onChange('')}>Изменить</button></div> : <>
      <input type="search" placeholder="Найти по нику" value={query} onChange={(e) => setQuery(e.target.value)} aria-label={`${label}: поиск`} />
      {error && <p role="alert">{error}</p>}
      <ul>{list.slice(0, 40).map((p) => <li key={p.id}><button type="button" onClick={() => onChange(p.id)}>{p.nickname}</button></li>)}</ul>
      {!list.length && !error && <p>Никого не нашли.</p>}
    </>}
  </fieldset>;
}

function CreateForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (id: string) => void }) {
  const [phrase, setPhrase] = useState('');
  const [length, setLength] = useState(7);
  const [guesser, setGuesser] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (busy) return; setBusy(true); setError('');
    try { const result = await sendJson<{ chain: TelephoneChainState }>(API, 'POST', { phrase, links: length, guesser_id: guesser, next_id: next }, 'Не удалось начать цепочку'); onCreated(result.chain.id); }
    catch (e) { setError(message(e)); } finally { setBusy(false); }
  };
  return <>
    <header><div className="dw-eyebrow">{TITLE}</div><h1>Новая цепочка</h1></header>
    <label className="tp-field">Фраза<textarea value={phrase} maxLength={TELEPHONE_TEXT_MAX} rows={2} placeholder="Например: кот учит рыбу плавать" onChange={(e) => setPhrase(e.target.value)} /></label>
    <div className="tp-field"><span>Сколько звеньев (от {TELEPHONE_MIN_LINKS} до {TELEPHONE_MAX_LINKS})</span>
      <div className="tp-stepper"><button type="button" aria-label="Меньше звеньев" disabled={length <= TELEPHONE_MIN_LINKS} onClick={() => setLength((n) => n - 1)}>−</button><strong data-testid="telephone-length">{length}</strong><button type="button" aria-label="Больше звеньев" disabled={length >= TELEPHONE_MAX_LINKS} onClick={() => setLength((n) => n + 1)}>+</button></div></div>
    <PlayerPicker label="Кто будет отгадывать в конце" chainId={null} exclude={next ? [next] : []} value={guesser} onChange={setGuesser} testId="telephone-guesser" />
    <PlayerPicker label="Кому передать первый ход" chainId={null} exclude={guesser ? [guesser] : []} value={next} onChange={setNext} testId="telephone-first" />
    {error && <div className="dw-error" role="alert"><p>{error}</p></div>}
    <div className="tp-actions"><button type="button" onClick={onCancel}>Отмена</button><button type="button" className="tp-primary" data-testid="telephone-start" disabled={busy || !phrase.trim() || !guesser || !next} onClick={() => void submit()}>{busy ? 'Запускаем…' : 'Запустить цепочку'}</button></div>
  </>;
}

function Item({ item }: { item: TelephoneItem }) {
  const who = item.kind === 'phrase' ? `Фраза · ${item.nickname}` : item.kind === 'guess' ? `Отгадка · ${item.nickname}` : `${item.position}. ${item.kind === 'drawing' ? 'Рисунок' : 'Подпись'} · ${item.nickname}`;
  return <figure className={`tp-item tp-item--${item.kind}`}><figcaption>{who}</figcaption>
    {item.image ? <img src={png(item.image)} alt={`Рисунок: ${item.nickname}`} /> : <blockquote>«{item.text}»</blockquote>}</figure>;
}

function ChainView({ chainId, onOpen, onMoved }: { chainId: string; onOpen: (id: string | null) => void; onMoved?: () => void }) {
  const [state, setState] = useState<TelephoneChainState | null>(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const pad = useRef<DrawingPadHandle | null>(null);
  const load = useCallback(async () => { try { setState(await getJson<TelephoneChainState>(`${API}/${encodeURIComponent(chainId)}`, 'Не удалось загрузить цепочку')); setError(''); } catch (e) { setError(message(e)); } }, [chainId]);
  useEffect(() => { void load(); }, [load]);
  const taskPosition = state?.my_task ? state.my_task.position : null;
  const textKey = taskPosition !== null ? `${draftKey(chainId, taskPosition)}:text` : null;
  useEffect(() => { if (textKey) setText(readDraft<string>(textKey) ?? ''); }, [textKey]);
  const changeText = (value: string) => { setText(value); if (textKey) writeDraft(textKey, value || null); };
  const act = async (path: string, body: Record<string, unknown>) => {
    if (busy) return; setBusy(true); setError('');
    try {
      await sendJson(`${API}/${encodeURIComponent(chainId)}/${path}`, 'POST', body, 'Не удалось сохранить');
      // The move is on the server: the saved drawing and text are not needed any more.
      if (taskPosition !== null) { writeDraft(draftKey(chainId, taskPosition), null); writeDraft(`${draftKey(chainId, taskPosition)}:text`, null); }
      askBeforeClosing(false);
      onMoved?.(); setText(''); setNext(''); await load();
    }
    catch (e) { setError(message(e)); } finally { setBusy(false); }
  };
  if (!state) return error ? <div className="dw-error" role="alert"><p>{error}</p><button type="button" onClick={() => void load()}>Повторить загрузку</button></div> : <p>Загружаем цепочку…</p>;
  const task = state.my_task;
  const header = <header><div className="dw-eyebrow">{TITLE}</div><h1>{state.status === 'done' ? 'Цепочка готова' : task ? (task.step === 'guess' ? 'Отгадай фразу' : task.step === 'choose' ? 'Кому передать ход?' : task.step === 'choose_guesser' ? 'Кто отгадает?' : task.kind === 'drawing' ? 'Нарисуй' : 'Подпиши рисунок') : 'Цепочка идёт'}</h1>
    <p>{state.status === 'done' ? `Автор ${state.author.nickname} · отгадывал ${state.guesser.nickname}` : `Звено ${Math.min(state.done_links + 1, state.length)} из ${state.length} · автор ${state.author.nickname} · отгадывает ${state.guesser.nickname}`}{state.deadline_at && task ? ` · осталось ${timeLeft(state.deadline_at)}` : ''}</p></header>;
  const picker = (label: string) => <PlayerPicker label={label} chainId={chainId} exclude={[]} value={next} onChange={setNext} testId="telephone-next" />;
  const errorBox = error && <div className="dw-error" role="alert"><p>{error}</p></div>;
  const decline = <button type="button" className="tp-decline" disabled={busy} onClick={() => void act('decline', {})}>Не хочу / нет времени</button>;
  if (state.status === 'done') return <>{header}<div className="tp-chain" data-testid="telephone-chain">{state.items.map((item) => <Item key={`${item.kind}-${item.position}`} item={item} />)}</div>
    {!state.items.some((i) => i.kind === 'guess') && <p>{state.guesser.nickname} не успел отгадать.</p>}<button type="button" onClick={() => onOpen(null)}>Ко всем цепочкам</button><Rules /></>;
  if (task?.step === 'choose' || task?.step === 'choose_guesser') return <>{header}
    <p>{task.step === 'choose' ? 'Ход не взяли. Выберите другого — того, кто ещё не ходил в этой цепочке.' : 'Отгадывающий не ответил. Выберите другого — того, кто не был в цепочке.'}</p>
    {picker(task.step === 'choose' ? 'Кому передать ход' : 'Кто будет отгадывать')}{errorBox}
    <button type="button" className="tp-primary" data-testid="telephone-choose" disabled={busy || !next} onClick={() => void act('choose', { next_id: next })}>{task.step === 'choose' ? 'Передать ход' : 'Передать отгадку'}</button></>;
  if (task?.step === 'guess') return <>{header}<p>Перед вами последняя подпись и последний рисунок. Какой была исходная фраза?</p><div className="tp-chain">{state.items.map((item) => <Item key={item.position} item={item} />)}</div>
    <label className="tp-field">Ваша отгадка<textarea rows={2} maxLength={TELEPHONE_TEXT_MAX} value={text} onChange={(e) => changeText(e.target.value)} /></label>{errorBox}
    <div className="tp-actions">{decline}<button type="button" className="tp-primary" data-testid="telephone-guess" disabled={busy || !text.trim()} onClick={() => void act('guess', { text })}>Отгадать</button></div></>;
  if (task?.step === 'move') {
    const previous = state.items[0];
    const body = task.kind === 'drawing'
      ? <><div className="tp-prompt"><small>Нарисуйте:</small><strong>«{previous?.text}»</strong></div><DrawingPad ref={pad} storageKey={draftKey(chainId, task.position)} /><p className="dw-hint">Буквы и слова на рисунке писать нельзя.</p></>
      : <><Item item={previous} /><label className="tp-field">Что нарисовано?<textarea rows={2} maxLength={TELEPHONE_TEXT_MAX} value={text} onChange={(e) => changeText(e.target.value)} /></label><p className="dw-hint">Нельзя слова, которые уже были в подписях этой цепочки, в любой форме.</p></>;
    const submit = () => {
      const payload: Record<string, unknown> = { position: task.position, ...(task.last ? {} : { next_id: next }) };
      if (task.kind === 'drawing') { const image = pad.current?.export(); if (!image) { setError('Нарисуйте что-нибудь'); return; } payload.image = image; } else payload.text = text;
      void act('move', payload);
    };
    return <>{header}{body}{task.last ? <p>Это последнее звено — дальше ход перейдёт к отгадывающему ({state.guesser.nickname}).</p> : picker('Кому передать ход дальше')}{errorBox}
      <div className="tp-actions">{decline}<button type="button" className="tp-primary" data-testid="telephone-submit" disabled={busy || (!task.last && !next) || (task.kind === 'caption' && !text.trim())} onClick={submit}>{busy ? 'Отправляем…' : 'Отдать ход'}</button></div></>;
  }
  return <>{header}{state.items.map((item) => <Item key={item.position} item={item} />)}
    <p>{state.current ? `Сейчас ход у ${state.current.nickname}.` : ''} Цепочка откроется всем, когда её отгадают.</p>
    {state.players.length > 0 && <p>Уже сходили: {state.players.map((p) => p.nickname).join(', ')}</p>}<Rules /></>;
}

type DrawingPadHandle = { export: () => string | null };
const SIZE = 480;
type Stroke = { color: string; width: number; points: Array<[number, number]> };
const DrawingPad = forwardRef<DrawingPadHandle, { storageKey: string }>(function DrawingPad({ storageKey }, ref) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const strokes = useRef<Stroke[]>([]);
  // A drawing kept from an earlier visit is offered back, not forced: «Продолжить рисунок» or «Начать заново».
  const [saved, setSaved] = useState<Stroke[] | null>(() => { const draft = readDraft<Stroke[]>(storageKey); return Array.isArray(draft) && draft.length ? draft : null; });
  const keep = () => { writeDraft(storageKey, strokes.current.length ? strokes.current : null); askBeforeClosing(strokes.current.length > 0); };
  useEffect(() => () => askBeforeClosing(false), []);
  const [color, setColor] = useState(TELEPHONE_COLORS[0]);
  const [width, setWidth] = useState(6);
  const [eraser, setEraser] = useState(false);
  const [count, setCount] = useState(0);
  const redraw = () => {
    const ctx = canvas.current?.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, SIZE, SIZE); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const stroke of strokes.current) {
      ctx.strokeStyle = stroke.color; ctx.lineWidth = stroke.width; ctx.beginPath();
      stroke.points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      if (stroke.points.length === 1) ctx.lineTo(stroke.points[0][0] + 0.1, stroke.points[0][1]);
      ctx.stroke();
    }
  };
  useEffect(redraw, []);
  useImperativeHandle(ref, () => ({ export: () => strokes.current.length && canvas.current ? canvas.current.toDataURL('image/png') : null }));
  const point = (event: React.PointerEvent<HTMLCanvasElement>): [number, number] => { const r = event.currentTarget.getBoundingClientRect(); return [Math.round((event.clientX - r.left) * SIZE / r.width * 10) / 10, Math.round((event.clientY - r.top) * SIZE / r.height * 10) / 10]; };
  const down = (event: React.PointerEvent<HTMLCanvasElement>) => { event.currentTarget.setPointerCapture(event.pointerId); strokes.current.push({ color: eraser ? '#ffffff' : color, width: eraser ? width * 4 : width, points: [point(event)] }); redraw(); };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; strokes.current[strokes.current.length - 1]?.points.push(point(event)); redraw(); };
  const up = () => { setCount(strokes.current.length); keep(); };
  const restore = () => { strokes.current = saved || []; setSaved(null); setCount(strokes.current.length); redraw(); askBeforeClosing(strokes.current.length > 0); };
  const startOver = () => { writeDraft(storageKey, null); setSaved(null); };
  return <div className="tp-pad">
    {saved && <div className="tp-saved" role="status" data-testid="telephone-draft-offer"><strong>У вас есть незаконченный рисунок</strong>
      <div className="tp-actions"><button type="button" onClick={startOver}>Начать заново</button><button type="button" className="tp-primary" data-testid="telephone-draft-restore" onClick={restore}>Продолжить рисунок</button></div></div>}
    <canvas ref={canvas} width={SIZE} height={SIZE} data-testid="telephone-canvas" aria-label="Поле для рисунка" className={saved ? 'tp-waiting' : ''} onPointerDown={(event) => { if (!saved) down(event); }} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
    <div className="tp-colors" role="group" aria-label="Цвет">{TELEPHONE_COLORS.map((c) => <button type="button" key={c} aria-label={`Цвет ${c}`} aria-pressed={!eraser && color === c} className={!eraser && color === c ? 'tp-on' : ''} style={{ background: c }} onClick={() => { setColor(c); setEraser(false); }}><span aria-hidden="true">●</span></button>)}</div>
    <div className="tp-tools">
      <button type="button" aria-pressed={width === 6} className={width === 6 ? 'tp-on' : ''} onClick={() => setWidth(6)}>Тонко</button>
      <button type="button" aria-pressed={width === 16} className={width === 16 ? 'tp-on' : ''} onClick={() => setWidth(16)}>Толсто</button>
      <button type="button" aria-pressed={eraser} className={eraser ? 'tp-on' : ''} onClick={() => setEraser((on) => !on)}>Ластик</button>
      <button type="button" disabled={!count} onClick={() => { strokes.current.pop(); setCount(strokes.current.length); redraw(); keep(); }}>↶ Отменить</button>
      <button type="button" disabled={!count} onClick={() => { strokes.current = []; setCount(0); redraw(); keep(); }}>Очистить</button>
    </div>
  </div>;
});
