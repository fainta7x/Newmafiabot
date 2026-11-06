import { JUDGE_MUSIC_PLAYER_ENABLED, requestJudgeGameMusicStart, requestJudgeGameMusicStop } from '../JudgeGameMusicController.tsx';
import { FitText } from '../ui/FitText.tsx';
import { RoleCard } from '../ui/RoleCard.tsx';
import { writeDealBroadcast } from '../../lib/liveBroadcastDeal';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { PlayerAvatar } from '../ui/PlayerAvatar.tsx';
import { SEAT_COLORS } from '../LiveGameEngine/seatColors.ts';
import { DealSeatPlayersContext } from './dealSeatPlayers.ts';
import './virtualRoleDeal.css';
import { GAME_ROLES, type GameRole } from '../../shared/gameRoles.ts';
import { isSupportedTableSize, tableRoleCounts } from '../../lib/tableComposition.ts';
import { clubGamesApi, type VirtualDealSnapshot } from '../../lib/clubGamesApi.ts';
import { loadTournamentDealState, saveTournamentDealState, clearTournamentDealState } from '../../lib/tournamentDealState.ts';

type Seat = { seat_number: number; nickname: string };
type Drawn = { seat: number; cardId: string; role: GameRole };
type Props = {
  seats: Seat[];
  onCancel: () => void;
  onComplete: (assignments: Record<number, GameRole>) => void | Promise<void>;
  finishLabel?: string;
  serverGameId?: number;
  /** Local tournament draw checkpoint, scoped to an exact game ID. Never used by server-backed club deals. */
  persistenceKey?: string;
  /** Tournament role draws must never sell or preassign a role. */
  allowRolePurchase?: boolean;
  /** Seconds a player has to take a card before it can be opened (owner, 2026-11-01); 0 switches the wait off. */
  cardSeconds?: number;
};
type Card = { id: string; role: GameRole | null };

function makeDeck(size: number): Card[] {
  if (!isSupportedTableSize(size)) return [];
  const counts = tableRoleCounts(size);
  const roles = (Object.keys(counts) as GameRole[]).flatMap((role) =>
    Array.from({ length: counts[role] }, () => role),
  );
  const deck = roles.map((role, id) => ({ id: String(id), role }));
  // Fisher–Yates with unbiased secure integer sampling, not Math.random.
  const randomInt = (max: number): number => {
    const array = new Uint32Array(1);
    const limit = Math.floor(4294967296 / max) * max;
    let value: number;
    do {
      crypto.getRandomValues(array);
      value = array[0];
    } while (value >= limit);
    return value % max;
  };
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** Owner, 2026-11-01: a bought role (card) costs 150 roubles (server: ROLE_PURCHASE_PRICE_RUB). */
const ROLE_PURCHASE_PRICE_RUB = 150;
export const DEFAULT_CARD_SECONDS = 10;
const configuredCardSeconds = (): number => {
  try {
    const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('role_deal_card_seconds') : null;
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : DEFAULT_CARD_SECONDS;
  } catch { return DEFAULT_CARD_SECONDS; }
};
const BUY_ROLES: GameRole[] = ['citizen', 'mafia', 'sheriff', 'don'];

export default function VirtualRoleDeal({ seats, onCancel, onComplete, serverGameId, persistenceKey, allowRolePurchase = true, cardSeconds, finishLabel='Все роли выданы — начать игру' }: Props) {
  const waitSeconds = cardSeconds ?? configuredCardSeconds();
  const orderedSeats = useMemo(() => [...seats].sort((a, b) => a.seat_number - b.seat_number), [seats]);
  const size = orderedSeats.length;
  const restored = useMemo(() => !serverGameId && persistenceKey ? loadTournamentDealState(persistenceKey, orderedSeats.map((seat) => seat.seat_number)) : null, [serverGameId, persistenceKey]);
  // The component is only mounted once the confirmed roster has a supported size.
  const [deck, setDeck] = useState<Card[]>(() => serverGameId ? [] : restored?.deck || makeDeck(size));
  const [history, setHistory] = useState<(Drawn & { previousDeck: Card[] })[]>(() => restored?.history || []);
  const [seat, setSeat] = useState<number>(() => restored?.seat ?? orderedSeats[0]?.seat_number ?? 1);
  const [selectedId, setSelectedId] = useState<string | null>(() => restored?.selectedId || null);
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState(!serverGameId);
  const [busy, setBusy] = useState(false);
  const [revealedRole, setRevealedRole] = useState<GameRole | null>(null);
  const openPromise = useRef<ReturnType<typeof clubGamesApi.roleDealOpen> | null>(null);
  const [showRole, setShowRole] = useState(() => restored?.showRole || false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [closeConfirm,setCloseConfirm]=useState(false);
  const [started,setStarted]=useState(() => restored?.started || false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  // The turn timer belongs to one turn: right after «Следующий игрок» the old start time was still read for the new player and
  // the program opened a random card for him at once (owner, 2026-11-03: «не выдаёт карту после первой»).
  const [turnStart,setTurnStart]=useState<{ key: string; at: number }|null>(null);
  // «Стартуем» (owner, 2026-11-03): the first player's turn opens only on the judge's tap; later turns open by themselves.
  const [go,setGo]=useState(() => restored?.go || false);
  const [now,setNow]=useState(()=>Date.now());
  const [buying,setBuying]=useState(false);
  // Where each card lies on the table: taken cards leave a faded place (owner-approved deal design, 2026-11-03).
  const [layout, setLayout] = useState<string[]>(() => restored?.layout || deck.map((card) => card.id));
  // Store after every committed state change. Restored state is loaded by initializers so
  // the first effect cannot clobber it with a new random deck.
  useEffect(() => {
    if (serverGameId || !persistenceKey) return;
    if (!saveTournamentDealState(persistenceKey, { deck, history, layout, seat, selectedId, showRole, started, go }, orderedSeats.map((entry) => entry.seat_number))) {
      setError('Не удалось сохранить промежуточную раздачу на устройстве. Не обновляйте страницу до завершения.');
    }
  }, [serverGameId, persistenceKey, deck, history, layout, seat, selectedId, showRole, started, go]);
  const playerOfSeat = useContext(DealSeatPlayersContext);
  useEffect(()=>()=>{requestJudgeGameMusicStop();},[]);
  useEffect(() => {
    if (!serverGameId) return;
    let active = true;
    const request = openPromise.current ?? (openPromise.current = clubGamesApi.roleDealOpen(serverGameId));
    void request.then((response) => {
      if (!active) return;
      setDeck(response.cards.map((card) => ({ ...card, role: null })));
      setLayout(response.cards.map((card) => card.id));
      setVersion(response.version);
      setLoaded(true);
    }).catch(() => {
      if (active) setError('Не удалось подготовить раздачу. Закройте окно и попробуйте снова.');
    });
    return () => { active = false; };
  }, [serverGameId]);
  const assigned = new Set(history.map((entry) => entry.seat));
  const nextSeat = orderedSeats.find((entry) => !assigned.has(entry.seat_number));
  const active = assigned.has(seat) ? nextSeat?.seat_number : seat;
  const current = orderedSeats.find((entry) => entry.seat_number === active);
  const selected = deck.find((entry) => entry.id === selectedId);
  const selectedRole = serverGameId ? revealedRole : selected?.role;
  const assignments = Object.fromEntries(history.map((entry) => [entry.seat, entry.role])) as Record<number, GameRole>;
  // Every seat has its card: the deal is over even if the server still lists a card (owner, 2026-11-03: after the 10th player it
  // offered «the next player» instead of the game).
  const complete = history.length >= size;
  const turnKey = `${active ?? 0}:${history.length}`;
  const turnStartedAt = turnStart && turnStart.key === turnKey ? turnStart.at : null;
  useEffect(() => { if (started) setBuying(false); }, [turnKey]);
  const waiting = waitSeconds > 0;
  const remaining = turnStartedAt === null ? waitSeconds : Math.max(0, Math.ceil(waitSeconds - (now - turnStartedAt) / 1000));
  useEffect(() => {
    if (turnStartedAt === null || remaining <= 0) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [turnStartedAt, remaining]);
  const turnOpen = !waiting || turnStartedAt !== null;
  const timeUp = !waiting || (turnStartedAt !== null && remaining <= 0);
  const startTurn = () => { setNotice(''); setNow(Date.now()); setTurnStart({ key: turnKey, at: Date.now() }); setSelectedId(null); };
  /**
   * Owner, 2026-11-03: «Начал раздачу — автоматом берётся игрок №1 и 10 секунд выбрать карту — потом кнопка "Следующий
   * игрок"». The turn opens by itself; a tapped card shows its role at once; when the time is up without a card the
   * program picks a random one; «Следующий игрок» only after the time.
   */
  // The deal on the stream (owner, 2026-11-03): the choosing seat is lit, a chosen card turns over and the viewers see the role.
  // Cards still in the deck, in their places; numbered again after each removal, the row narrows (BUSINESS_RULES, deal).
  const cardsLeft = layout.filter((id) => deck.some((card) => card.id === id));
  const openPosition = selected && showRole && selectedRole ? cardsLeft.indexOf(selected.id) + 1 : 0;
  const dealCardsKey = cardsLeft.join(',');
  useEffect(() => {
    if (!started || complete || !loaded || active === undefined) { writeDealBroadcast(null); return; }
    writeDealBroadcast({
      seat: active,
      cards: cardsLeft.map((_, index) => ({ position: index + 1 })),
      open: openPosition > 0 && selectedRole ? { position: openPosition, role: selectedRole } : null,
      dealt: assignments,
    });
  }, [started, complete, loaded, active, dealCardsKey, openPosition, selectedRole, history.length]);
  useEffect(() => () => writeDealBroadcast(null), []);
  useEffect(() => {
    if (!started || complete || !loaded || active === undefined || turnStartedAt !== null || (!go && history.length === 0)) return;
    startTurn();
  }, [started, complete, loaded, active, turnStartedAt, go, history.length]);
  useEffect(() => {
    if (!started || !waiting || !timeUp || turnStartedAt === null || showRole || selectedId || busy || !deck.length) return;
    const array = new Uint32Array(1);
    const max = deck.length;
    const limit = Math.floor(4294967296 / max) * max;
    do { crypto.getRandomValues(array); } while (array[0] >= limit);
    void revealCard(deck[array[0] % max].id);
  }, [started, waiting, timeUp, turnStartedAt, showRole, selectedId, busy, deck]);
  const dealt: Partial<Record<GameRole, number>> = {};
  for (const entry of history) dealt[entry.role] = (dealt[entry.role] ?? 0) + 1;
  const roleLeft = (role: GameRole) => (isSupportedTableSize(size) ? tableRoleCounts(size)[role] ?? 0 : 0) - (dealt[role] ?? 0);
  const buyRole = async (role: GameRole) => {
    if (!allowRolePurchase || active === undefined || busy || showRole || roleLeft(role) < 1) return;
    setBusy(true);
    try {
      let seatPlayerNote = '';
      if (serverGameId) {
        const snapshot = await clubGamesApi.roleDealBuy(serverGameId, { seat: active, role, version });
        updateFromServer(snapshot);
        seatPlayerNote = `Покупка ${snapshot.priceRub} ₽ записана за игроком №${active}.`;
        const next = orderedSeats.find((entry) => !snapshot.history.some((done) => done.seat === entry.seat_number));
        if (next) setSeat(next.seat_number);
      } else {
        const card = deck.find((entry) => entry.role === role);
        if (!card) return;
        const nextHistory = [...history, { seat: active, cardId: card.id, role, previousDeck: deck }];
        setHistory(nextHistory);
        setDeck((old) => old.filter((entry) => entry.id !== card.id));
        setSelectedId(null);
        const next = orderedSeats.find((entry) => !nextHistory.some((done) => done.seat === entry.seat_number));
        if (next) setSeat(next.seat_number);
      }
      setNotice(`Роль «${GAME_ROLES[role].label}» куплена игроком №${active}. ${seatPlayerNote}`.trim());
      setBuying(false);
      setError('');
    } catch { setError('Не удалось выдать купленную роль. Повторите попытку.'); }
    finally { setBusy(false); }
  };
  const updateFromServer = (snapshot: VirtualDealSnapshot) => {
    setDeck(snapshot.cards.map((card) => ({ ...card, role: null })));
    setHistory(snapshot.history.map((entry) => ({ ...entry, previousDeck: [] })));
    setVersion(snapshot.version);
    setSelectedId(null);
    setRevealedRole(null);
    setShowRole(false);
  };
  const confirmCard = async () => {
    if (!showRole || !selected || active === undefined || assigned.has(active) || busy) return;
    if (serverGameId) {
      setBusy(true);
      try {
        const snapshot = await clubGamesApi.roleDealConfirm(serverGameId, { seat: active, cardId: selected.id, version });
        updateFromServer(snapshot);
        const next = orderedSeats.find((entry) => !snapshot.history.some((done) => done.seat === entry.seat_number));
        if (next) setSeat(next.seat_number);
        setError('');
      } catch {
        setError('Не удалось подтвердить карту. Повторите попытку.');
      } finally { setBusy(false); }
      return;
    }
    if (!selected.role) return;
    const nextHistory = [...history, { seat: active, cardId: selected.id, role: selected.role, previousDeck: deck }];
    setHistory(nextHistory);
    setDeck((old) => old.filter((card) => card.id !== selected.id));
    setSelectedId(null);
    setShowRole(false);
    const next = orderedSeats.find((entry) => !nextHistory.some((done) => done.seat === entry.seat_number));
    if (next) setSeat(next.seat_number);
  };
  const undo = async () => {
    const last = history[history.length - 1];
    if (!last || busy) return;
    if (serverGameId) {
      setBusy(true);
      try {
        const snapshot = await clubGamesApi.roleDealUndo(serverGameId, version);
        updateFromServer(snapshot);
        setSeat(last.seat);
        setError('');
      } catch { setError('Не удалось отменить карту. Повторите попытку.'); }
      finally { setBusy(false); }
      return;
    }
    setDeck(last.previousDeck);
    setHistory(history.slice(0, -1));
    setSeat(last.seat);
    setSelectedId(null);
    setShowRole(false);
  };
  const revealCard = async (cardId: string | undefined = selected?.id) => {
    if (!cardId || active === undefined || busy || showRole) return;
    setSelectedId(cardId);
    if (serverGameId) {
      setBusy(true);
      try {
        const result = await clubGamesApi.roleDealReveal(serverGameId, { seat: active, cardId, version });
        setVersion(result.version);
        setRevealedRole(result.role);
        setShowRole(true);
        setError('');
      } catch { setError('Не удалось открыть карту. Повторите попытку.'); }
      finally { setBusy(false); }
      return;
    }
    setShowRole(true);
  };
  const resetDeal = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (serverGameId) {
        const snapshot = await clubGamesApi.roleDealReset(serverGameId, version);
        updateFromServer(snapshot);
        setLayout(snapshot.cards.map((card) => card.id));
      } else {
        const fresh = makeDeck(size);
        setDeck(fresh);
        setLayout(fresh.map((card) => card.id));
        setHistory([]);
        setSelectedId(null);
        setShowRole(false);
      }
      setSeat(orderedSeats[0].seat_number);
      setTurnStart(null);
      setGo(false);
      setStarted(false);
      setBuying(false);
      autoFinished.current = false;
      setResetConfirm(false);
      setError('');
    } catch { setError('Не удалось перераздать карты. Повторите попытку.'); }
    finally { setBusy(false); }
  };
  const close=()=>{if(persistenceKey)clearTournamentDealState(persistenceKey);requestJudgeGameMusicStop();onCancel();};
  const finish=async()=>{
    if(saving||!complete)return;setSaving(true);setError('');
    try{await onComplete(assignments);if(persistenceKey)clearTournamentDealState(persistenceKey);requestJudgeGameMusicStop();}catch(error:any){setError(error?.message||'Не удалось сохранить роли');}finally{setSaving(false);}
  };
  // The last card confirmed → straight into the game; the button stays for a retry if saving failed.
  const autoFinished = useRef(false);
  useEffect(() => {
    if (!complete || autoFinished.current) return;
    autoFinished.current = true;
    void finish();
  }, [complete]);
  const seatTile = (player: Seat, options: { disabled: boolean; onClick: () => void }) => {
    const color = SEAT_COLORS[player.seat_number];
    return (
      <button key={player.seat_number} type="button" disabled={options.disabled} onClick={options.onClick} aria-pressed={active === player.seat_number}
        aria-label={`№${player.seat_number} ${player.nickname}`} className="deal-seat"
        style={color ? ({ '--seat-fill': color.fill, '--seat-line': color.line } as React.CSSProperties) : undefined}>
        <span className="deal-seat__number">{player.seat_number}</span>
        {assigned.has(player.seat_number) ? <span className="deal-seat__done" aria-hidden="true">✓</span> : null}
        <span className="deal-seat__avatar"><PlayerAvatar playerId={playerOfSeat?.(player.seat_number) ?? null} nickname={player.nickname} size="sm" /></span>
        <FitText as="div" minPx={8} className="deal-seat__name">{player.nickname}</FitText>
      </button>
    );
  };
  const timerShare = waiting && turnStartedAt !== null ? Math.max(0, Math.min(1, 1 - (now - turnStartedAt) / 1000 / waitSeconds)) : 0;
  if (!isSupportedTableSize(size)) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label="Раздача виртуальных ролей" data-testid="virtual-role-deal" className="fixed inset-0 z-[160] bg-[#090a0d]/95 backdrop-blur-xl">
      <div className={`absolute inset-x-0 top-0 overflow-y-auto p-3 ${started ? 'bottom-[calc(88px+env(safe-area-inset-bottom))]' : 'bottom-0'}`}>
      <div className="mx-auto w-full max-w-lg space-y-3 rounded-3xl border border-white/10 bg-[#121318] p-4 text-white [@media(max-height:700px)]:space-y-1.5 [@media(max-height:700px)]:p-2.5">
        <header className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-white/40">Виртуальная колода</div>
            <h2 className="text-xl font-semibold [@media(max-height:700px)]:text-base">Раздача ролей</h2>
            <p className="text-xs text-white/50">Выдано {history.length} из {size}</p>
          </div>
          <button type="button" disabled={saving || busy} onClick={()=>{if(history.length||showRole)setCloseConfirm(true);else close();}} aria-label="Закрыть раздачу" className="min-h-11 rounded-xl border border-white/20 px-4">Закрыть</button>
        </header>
        {!started ? <div className="space-y-3">
          <p className="text-sm leading-6">Карты уже перемешаны. Каждый игрок по очереди выбирает карту за {waitSeconds} с и видит свою роль.</p>
          {/* Owner, 2026-11-03: a bought role is marked before the deal starts. */}
          {!serverGameId && allowRolePurchase && <button type="button" data-testid="virtual-deal-buy-role" disabled={!loaded || busy} onClick={() => setBuying((value) => !value)} className="min-h-11 w-full rounded-xl border border-white/20 text-sm font-semibold">Покупка роли</button>}
          {!serverGameId && allowRolePurchase && buying && (
            <div data-testid="virtual-deal-buy-panel" role="group" aria-label="Покупка роли" className="space-y-2 rounded-xl border border-white/15 bg-black/20 p-2.5">
              <div className="deal-seats" aria-label="Кто покупает">
                {orderedSeats.map((player) => seatTile(player, { disabled: assigned.has(player.seat_number) || busy, onClick: () => setSeat(player.seat_number) }))}
              </div>
              <p className="text-xs text-white/70">Игрок №{current?.seat_number} покупает роль{serverGameId ? ` (${ROLE_PURCHASE_PRICE_RUB} ₽)` : ''}. Карта этой роли уйдёт из колоды.</p>
              <div className="grid grid-cols-4 gap-2">
                {BUY_ROLES.map((role) => (
                  <button key={role} type="button" disabled={busy || roleLeft(role) < 1} onClick={() => { void buyRole(role); }} aria-label={`Купить роль ${GAME_ROLES[role].label}`} className="min-w-0 disabled:opacity-30">
                    <RoleCard role={role} label={GAME_ROLES[role].label} count={String(roleLeft(role))} />
                  </button>
                ))}
              </div>
            </div>
          )}
          <button type="button" disabled={!loaded || busy} onClick={()=>{requestJudgeGameMusicStart(undefined,{modal:true});setStarted(true);}} className="min-h-12 w-full rounded-xl bg-white px-3 py-3 text-sm font-semibold text-black">{JUDGE_MUSIC_PLAYER_ENABLED?'Включить музыку и начать раздачу':'Начать раздачу'}</button>
        </div>:null}
        {started && !complete && (
          <>
            <div className="deal-seats" aria-label="Очередность игроков">
              {orderedSeats.map((player) => seatTile(player, { disabled: assigned.has(player.seat_number) || showRole || busy, onClick: () => { setSeat(player.seat_number); setSelectedId(null); } }))}
            </div>
            <div className="deal-turn" data-testid="virtual-deal-turn">
              <PlayerAvatar playerId={current ? playerOfSeat?.(current.seat_number) ?? null : null} nickname={current?.nickname || ''} size="md" />
              <div className="deal-turn__who">
                <div className="deal-turn__label">Выбирает карту</div>
                <div className="deal-turn__name">№{current?.seat_number} {current?.nickname}</div>
              </div>
              {waiting && turnOpen ? <div className="deal-turn__time" data-testid="virtual-deal-timer" role="timer" aria-label={`Выбирает карту: ещё ${remaining} с`}>{remaining}с</div> : null}
            </div>
            {waiting ? <div className="deal-bar" aria-hidden="true"><i style={{ width: `${Math.round(timerShare * 100)}%` }} /></div> : null}
            {!go && history.length === 0 ? <button type="button" data-testid="virtual-deal-go" disabled={!loaded || busy} onClick={() => setGo(true)} className="min-h-12 w-full rounded-xl bg-white px-3 py-3 text-sm font-semibold text-black">Стартуем</button> : null}
            {/* Numbered cards in two rows, no scrolling row (owner, 2026-11-01). */}
            <div className="deal-table">
              {selected && showRole && selectedRole ? (
                <div className="deal-face" role="status" aria-label={`Роль: ${GAME_ROLES[selectedRole].label}`}>
                  <RoleCard role={selectedRole} label={GAME_ROLES[selectedRole].label} />
                </div>
              ) : (
                <div className="deal-cards" data-testid="virtual-card-grid" role="group" aria-label="Закрытые карты">
                  {cardsLeft.map((id, index) => {
                    const card = deck.find((entry) => entry.id === id)!;
                    return (
                      <button key={id} type="button" className="deal-card" disabled={showRole || busy || !turnOpen || Boolean(selectedId)} onClick={() => { void revealCard(card.id); }}
                        aria-label={`Карта №${index + 1}`} aria-pressed={selectedId === card.id}>
                        <span className="deal-card__number">{index + 1}</span><span className="deal-card__logo" aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {showRole && <button type="button" data-testid="virtual-deal-next-player" disabled={busy || !timeUp} onClick={() => { void confirmCard(); }} className="min-h-12 w-full rounded-xl bg-white font-semibold text-black disabled:opacity-40">{timeUp ? 'Следующий игрок' : `Следующий игрок · ${remaining} с`}</button>}
          </>
        )}
        {complete && <button type="button" disabled={saving} onClick={()=>void finish()} className="min-h-12 w-full rounded-xl bg-white px-3 py-3 text-sm font-semibold text-black disabled:opacity-50">{saving?'Сохраняем роли…':finishLabel}</button>}
        {notice?<p role="status" data-testid="virtual-deal-notice" className="text-xs text-emerald-300">{notice}</p>:null}
        {error?<p role="alert" className="text-sm text-rose-300">{error}</p>:null}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={!history.length || showRole || saving || busy} onClick={() => { void undo(); }} className="min-h-11 rounded-xl border border-white/20 text-xs disabled:opacity-30">Отменить последнюю карту</button>
          <button type="button" disabled={saving||!started||busy} onClick={() => setResetConfirm(true)} className="min-h-11 rounded-xl border border-white/20 text-xs">Перераздать всё</button>
        </div>
        {closeConfirm && <div role="alertdialog" aria-label="Прервать раздачу" className="space-y-3 rounded-xl border border-amber-300/30 p-3">
          <p className="text-sm leading-6">Закрыть раздачу? Открытые и подтверждённые карты будут сброшены. При следующем открытии колода перемешается заново.</p>
          <button type="button" onClick={()=>setCloseConfirm(false)} className="min-h-11 w-full rounded-lg border border-white/20 px-3 py-2">Продолжить раздачу</button>
          <button type="button" onClick={close} className="min-h-11 w-full rounded-lg bg-white px-3 py-2 text-black">Подтвердить сброс и закрыть</button>
        </div>}
        {resetConfirm && <div role="alertdialog" aria-label="Подтвердить перераздачу" className="rounded-xl border border-amber-300/30 p-3">
          <p className="mb-3 text-sm">Удалить текущую раздачу и заново перемешать колоду?</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setResetConfirm(false)} className="min-h-11 rounded-lg border border-white/20">Нет</button>
            <button type="button" onClick={() => { void resetDeal(); }} disabled={busy} className="min-h-11 rounded-lg bg-white text-black">Да, перераздать</button>
          </div>
        </div>}
      </div>
      </div>
    </div>
  );
}
