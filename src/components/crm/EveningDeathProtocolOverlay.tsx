import React from 'react';

export type DeathProtocolSelection = {
  red: number[];
  black: number[];
  sheriff: number[];
};

export type StoredDeathProtocols = Record<number, DeathProtocolSelection>;

export const emptyDeathProtocolSelection = (): DeathProtocolSelection => ({
  red: [],
  black: [],
  sheriff: [],
});

const seatNumbers = Array.from({ length: 10 }, (_, index) => index + 1);
const sorted = (values: number[]) => [...values].sort((a, b) => a - b);
const storageKey = (gameId: string) => `mafia_live_death_protocols:${gameId}`;

const normalizeSelection = (value: any): DeathProtocolSelection => ({
  red: Array.isArray(value?.red) ? value.red.map(Number).filter((seat: number) => seat >= 1 && seat <= 10) : [],
  black: Array.isArray(value?.black) ? value.black.map(Number).filter((seat: number) => seat >= 1 && seat <= 10) : [],
  sheriff: Array.isArray(value?.sheriff) ? value.sheriff.map(Number).filter((seat: number) => seat >= 1 && seat <= 10).slice(0, 1) : [],
});

export const readStoredDeathProtocols = (gameId: string): StoredDeathProtocols => {
  try {
    const raw = localStorage.getItem(storageKey(gameId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const next: StoredDeathProtocols = {};
    Object.entries(parsed || {}).forEach(([rawSlot, value]) => {
      const slot = Number(rawSlot);
      if (Number.isInteger(slot) && slot >= 1 && slot <= 10) next[slot] = normalizeSelection(value);
    });
    return next;
  } catch {
    return {};
  }
};

export const clearStoredDeathProtocols = (gameId: string) => {
  try { localStorage.removeItem(storageKey(gameId)); } catch {}
};

const writeStoredDeathProtocols = (gameId: string, value: StoredDeathProtocols) => {
  try { localStorage.setItem(storageKey(gameId), JSON.stringify(value)); } catch {}
};

interface EveningDeathProtocolOverlayProps {
  killedSlot: number;
  killedName: string;
  timeLeft: number;
  value: DeathProtocolSelection;
  onChange: (value: DeathProtocolSelection) => void;
  onConfirm: () => void;
  onBack: () => void;
  error?: string | null;
}

export const EveningDeathProtocolOverlay: React.FC<EveningDeathProtocolOverlayProps> = ({
  killedSlot,
  killedName,
  timeLeft,
  value,
  onChange,
  onConfirm,
  onBack,
  error,
}) => {
  const toggleTeam = (mark: 'red' | 'black', seat: number) => {
    const other = mark === 'red' ? 'black' : 'red';
    const isSelected = value[mark].includes(seat);
    onChange({
      ...value,
      [mark]: isSelected ? value[mark].filter((item) => item !== seat) : sorted([...value[mark], seat]),
      [other]: isSelected ? value[other] : value[other].filter((item) => item !== seat),
    });
  };

  const toggleSheriff = (seat: number) => {
    onChange({
      ...value,
      sheriff: value.sheriff[0] === seat ? [] : [seat],
    });
  };

  const renderRow = (
    label: string,
    mark: 'red' | 'black' | 'sheriff',
    activeClass: string,
    onToggle: (seat: number) => void,
  ) => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-black uppercase tracking-wide text-slate-300">{label}</span>
        <span className="text-[9px] text-slate-500 truncate">
          {value[mark].length ? value[mark].map((seat) => `#${seat}`).join(', ') : '—'}
        </span>
      </div>
      <div className="grid grid-cols-10 gap-1 sm:gap-1.5">
        {seatNumbers.map((seat) => {
          const selected = value[mark].includes(seat);
          return (
            <button
              key={`${mark}-${seat}`}
              type="button"
              onClick={() => onToggle(seat)}
              aria-pressed={selected}
              className={`min-w-0 aspect-square rounded-lg sm:rounded-xl border font-mono font-black text-[11px] sm:text-sm transition active:scale-95 ${
                selected
                  ? activeClass
                  : 'bg-slate-950/80 border-slate-700 text-slate-400 hover:border-slate-500'
              }`}
            >
              {seat}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[126] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl sm:rounded-3xl border-2 border-slate-700 bg-slate-900 shadow-2xl p-3 sm:p-5 space-y-3 sm:space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-widest text-amber-400">Протокол убитого</div>
            <div className="text-base sm:text-lg font-black text-white truncate">#{killedSlot} · {killedName}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Красный и чёрный взаимоисключаются. Шериф выбирается отдельно.</div>
          </div>
          <div className={`shrink-0 min-w-[54px] h-11 px-2 rounded-xl border flex items-center justify-center font-mono font-black text-2xl ${timeLeft <= 5 ? 'bg-rose-950 border-rose-600 text-rose-300' : 'bg-slate-950 border-slate-700 text-emerald-400'}`}>
            {Math.max(0, timeLeft)}с
          </div>
        </div>

        {renderRow('Красные', 'red', 'bg-rose-600 border-rose-400 text-white shadow-[0_0_12px_rgba(244,63,94,0.28)]', (seat) => toggleTeam('red', seat))}
        {renderRow('Чёрные', 'black', 'bg-slate-950 border-amber-400 text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.2)]', (seat) => toggleTeam('black', seat))}
        {renderRow('Шериф', 'sheriff', 'bg-emerald-700 border-emerald-400 text-white shadow-[0_0_12px_rgba(16,185,129,0.25)]', toggleSheriff)}

        {error && <div className="rounded-xl border border-rose-700 bg-rose-950/60 px-3 py-2 text-[10px] font-bold text-rose-200">{error}</div>}

        <div className="grid grid-cols-12 gap-2 pt-1">
          <button
            type="button"
            onClick={onBack}
            className="col-span-4 min-h-11 rounded-xl bg-slate-950 border border-slate-700 text-slate-300 text-[10px] font-black"
          >
            ← Прощальная
          </button>
          <button
            type="button"
            onClick={() => onChange(emptyDeathProtocolSelection())}
            className="col-span-3 min-h-11 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-black"
          >
            Сбросить
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="col-span-5 min-h-11 rounded-xl bg-emerald-600 border border-emerald-500 text-white text-[10px] sm:text-xs font-black uppercase"
          >
            Сохранить → день
          </button>
        </div>
      </div>
    </div>
  );
};

interface EveningDeathProtocolBridgeProps {
  gameId: string;
  players: Array<{ seat_number: number; display_name: string }>;
}

type LiveSessionView = {
  postNightStage: string;
  shotPlayerSlot: number | null;
  timeLeft: number;
};

const findEngineButton = (label: string): HTMLButtonElement | null => {
  const root = document.querySelector('.evening-live-engine-shell');
  if (!root) return null;
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
    (button.textContent || '').replace(/\s+/g, ' ').trim().includes(label),
  ) || null;
};

export const EveningDeathProtocolBridge: React.FC<EveningDeathProtocolBridgeProps> = ({ gameId, players }) => {
  const [session, setSession] = React.useState<LiveSessionView>({ postNightStage: 'none', shotPlayerSlot: null, timeLeft: 0 });
  const [editingSlot, setEditingSlot] = React.useState<number | null>(null);
  const [value, setValue] = React.useState<DeathProtocolSelection>(emptyDeathProtocolSelection());
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let lastSignature = '';
    const sync = () => {
      try {
        const raw = localStorage.getItem('mafia_live_session');
        if (!raw) return;
        const parsed = JSON.parse(raw);
        const shot = Number(parsed?.shotPlayerSlot);
        const next: LiveSessionView = {
          postNightStage: String(parsed?.postNightStage || 'none'),
          shotPlayerSlot: Number.isInteger(shot) && shot >= 1 && shot <= 10 ? shot : null,
          timeLeft: Math.max(0, Number(parsed?.timeLeft || 0)),
        };
        const signature = JSON.stringify(next);
        if (signature !== lastSignature) {
          lastSignature = signature;
          setSession(next);
        }
      } catch {}
    };

    sync();
    const intervalId = window.setInterval(sync, 250);
    return () => window.clearInterval(intervalId);
  }, []);

  React.useEffect(() => {
    const slot = session.postNightStage === 'death_protocol' ? session.shotPlayerSlot : null;
    if (slot === null) {
      if (editingSlot !== null) setEditingSlot(null);
      setError(null);
      return;
    }
    if (editingSlot === slot) return;
    const saved = readStoredDeathProtocols(gameId)[slot] || emptyDeathProtocolSelection();
    setEditingSlot(slot);
    setValue(saved);
    setError(null);
  }, [session.postNightStage, session.shotPlayerSlot, editingSlot, gameId]);

  if (session.postNightStage !== 'death_protocol' || session.shotPlayerSlot === null || editingSlot === null) return null;

  const killedSlot = session.shotPlayerSlot;
  const killedName = players.find((player) => player.seat_number === killedSlot)?.display_name || `Игрок ${killedSlot}`;

  const handleConfirm = () => {
    const stored = readStoredDeathProtocols(gameId);
    const next: StoredDeathProtocols = { ...stored, [killedSlot]: normalizeSelection(value) };
    writeStoredDeathProtocols(gameId, next);
    const nextButton = findEngineButton('К дневным речам');
    if (!nextButton) {
      setError('Протокол сохранён, но не найдена кнопка перехода к дневным речам. Закройте форму кнопкой «Прощальная» и повторите переход.');
      return;
    }
    setError(null);
    nextButton.click();
  };

  const handleBack = () => {
    const backButton = findEngineButton('Прощальная');
    if (!backButton) {
      setError('Не найдена кнопка возврата к прощальной речи.');
      return;
    }
    setError(null);
    backButton.click();
  };

  return (
    <EveningDeathProtocolOverlay
      killedSlot={killedSlot}
      killedName={killedName}
      timeLeft={session.timeLeft}
      value={value}
      onChange={setValue}
      onConfirm={handleConfirm}
      onBack={handleBack}
      error={error}
    />
  );
};
