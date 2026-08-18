import React from 'react';
import { determineLiveWinner, type LiveFlowPlayer, type LiveWinnerTeam } from '../../lib/liveGameFlow';
import {
  type DeathProtocolSelection,
  emptyDeathProtocolSelection,
  normalizeDeathProtocolSelection,
  readStoredDeathProtocols,
  storeDeathProtocol,
  clearStoredDeathProtocols,
} from '../../lib/liveDeathProtocol';

interface EveningDeathProtocolOverlayProps {
  killedSlot: number;
  killedName: string;
  timeLeft: number;
  value: DeathProtocolSelection;
  onChange: (value: DeathProtocolSelection) => void;
  onConfirm: () => void;
  onBack: () => void;
  error?: string | null;
  finishGame?: boolean;
  submitting?: boolean;
}

const seatNumbers = Array.from({ length: 10 }, (_, index) => index + 1);
const sorted = (values: number[]) => [...values].sort((a, b) => a - b);

export const EveningDeathProtocolOverlay: React.FC<EveningDeathProtocolOverlayProps> = ({
  killedSlot,
  killedName,
  timeLeft,
  value,
  onChange,
  onConfirm,
  onBack,
  error,
  finishGame = false,
  submitting = false,
}) => {
  const toggleTeam = (mark: 'red' | 'black', seat: number) => {
    if (submitting) return;
    const other = mark === 'red' ? 'black' : 'red';
    const isSelected = value[mark].includes(seat);
    onChange({
      ...value,
      [mark]: isSelected ? value[mark].filter((item) => item !== seat) : sorted([...value[mark], seat]),
      [other]: isSelected ? value[other] : value[other].filter((item) => item !== seat),
    });
  };

  const toggleSheriff = (seat: number) => {
    if (submitting) return;
    onChange({ ...value, sheriff: value.sheriff[0] === seat ? [] : [seat] });
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
              disabled={submitting}
              onClick={() => onToggle(seat)}
              aria-pressed={selected}
              className={`min-w-0 aspect-square rounded-lg sm:rounded-xl border font-mono font-black text-[11px] sm:text-sm transition active:scale-95 disabled:opacity-60 ${
                selected ? activeClass : 'bg-slate-950/80 border-slate-700 text-slate-400 hover:border-slate-500'
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
          <button type="button" disabled={submitting} onClick={onBack} className="col-span-4 min-h-11 rounded-xl bg-slate-950 border border-slate-700 text-slate-300 text-[10px] font-black disabled:opacity-50">
            ← Последняя речь
          </button>
          <button type="button" disabled={submitting} onClick={() => onChange(emptyDeathProtocolSelection())} className="col-span-3 min-h-11 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-black disabled:opacity-50">
            Сбросить
          </button>
          <button type="button" disabled={submitting} onClick={onConfirm} className="col-span-5 min-h-11 rounded-xl bg-emerald-600 border border-emerald-500 text-white text-[10px] sm:text-xs font-black uppercase disabled:opacity-60">
            {submitting ? 'Сохраняем…' : finishGame ? 'Сохранить → протокол' : 'Сохранить → день'}
          </button>
        </div>
      </div>
    </div>
  );
};

type LiveSessionView = {
  postNightStage: string;
  shotPlayerSlot: number | null;
  timeLeft: number;
  killedName: string;
  winner: LiveWinnerTeam | null;
};

const emptyLiveSession = (): LiveSessionView => ({
  postNightStage: 'none',
  shotPlayerSlot: null,
  timeLeft: 0,
  killedName: '',
  winner: null,
});

const findEngineButton = (labels: string | string[]): HTMLButtonElement | null => {
  const root = document.querySelector('.evening-live-engine-shell');
  if (!root) return null;
  const accepted = Array.isArray(labels) ? labels : [labels];
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((button) => {
    const text = (button.textContent || '').replace(/\s+/g, ' ').trim();
    return accepted.some((label) => text.includes(label));
  }) || null;
};

export const EveningDeathProtocolBridge: React.FC = () => {
  const [session, setSession] = React.useState<LiveSessionView>(() => emptyLiveSession());
  const [editingSlot, setEditingSlot] = React.useState<number | null>(null);
  const [value, setValue] = React.useState<DeathProtocolSelection>(emptyDeathProtocolSelection());
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!localStorage.getItem('mafia_live_session')) clearStoredDeathProtocols();

    let lastSignature = '';
    const sync = () => {
      try {
        const raw = localStorage.getItem('mafia_live_session');
        if (!raw) {
          lastSignature = '';
          setSession((current) => current.postNightStage === 'none' ? current : emptyLiveSession());
          setEditingSlot(null);
          setError(null);
          setSubmitting(false);
          return;
        }
        const parsed = JSON.parse(raw);
        const shot = Number(parsed?.shotPlayerSlot);
        const shotPlayerSlot = Number.isInteger(shot) && shot >= 1 && shot <= 10 ? shot : null;
        const activePlayers = Array.isArray(parsed?.activePlayers) ? parsed.activePlayers : [];
        const killedPlayer = shotPlayerSlot === null ? null : activePlayers.find((player: any) => Number(player?.slot_num) === shotPlayerSlot);
        const flowPlayers: LiveFlowPlayer[] = [];
        for (const player of activePlayers) {
          const slot = Number(player?.slot_num);
          const team = player?.team;
          if (!Number.isInteger(slot) || (team !== 'Красные' && team !== 'Чёрные')) continue;
          flowPlayers.push({ slot_num: slot, team, alive: Boolean(player?.alive) });
        }
        const winner = flowPlayers.length ? determineLiveWinner(flowPlayers) : null;
        const next: LiveSessionView = {
          postNightStage: String(parsed?.postNightStage || 'none'),
          shotPlayerSlot,
          timeLeft: Math.max(0, Number(parsed?.timeLeft || 0)),
          killedName: String(killedPlayer?.nickname || (shotPlayerSlot ? `Игрок ${shotPlayerSlot}` : '')),
          winner,
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
      setSubmitting(false);
      return;
    }
    if (editingSlot === slot) return;
    const saved = readStoredDeathProtocols()[slot] || emptyDeathProtocolSelection();
    setEditingSlot(slot);
    setValue(saved);
    setError(null);
    setSubmitting(false);
  }, [session.postNightStage, session.shotPlayerSlot, editingSlot]);

  if (session.postNightStage !== 'death_protocol' || session.shotPlayerSlot === null || editingSlot === null) return null;

  const killedSlot = session.shotPlayerSlot;

  const handleConfirm = () => {
    if (submitting) return;
    storeDeathProtocol(killedSlot, normalizeDeathProtocolSelection(value));
    setSubmitting(true);
    setError(null);

    const tryAdvance = (attempt: number) => {
      const nextButton = session.winner
        ? findEngineButton(['Завершить игру', 'Применить авто-победу'])
        : findEngineButton(['Открыть день', 'К дневным речам']);

      if (nextButton) {
        setSession(emptyLiveSession());
        setEditingSlot(null);
        nextButton.click();
        return;
      }

      if (!localStorage.getItem('mafia_live_session')) {
        setSession(emptyLiveSession());
        setEditingSlot(null);
        setSubmitting(false);
        return;
      }

      if (attempt < 10) {
        window.setTimeout(() => tryAdvance(attempt + 1), 60);
        return;
      }

      setSubmitting(false);
      setError(session.winner
        ? 'Протокол сохранён, но не удалось запустить завершение игры. Нажмите ещё раз.'
        : 'Протокол сохранён, но не удалось перейти в день. Нажмите ещё раз.');
    };

    tryAdvance(0);
  };

  const handleBack = () => {
    if (submitting) return;
    const backButton = findEngineButton(['Назад', 'Последняя речь', 'Прощальная']);
    if (!backButton) {
      setError('Не найдена кнопка возврата к последней речи.');
      return;
    }
    setError(null);
    backButton.click();
  };

  return (
    <EveningDeathProtocolOverlay
      killedSlot={killedSlot}
      killedName={session.killedName || `Игрок ${killedSlot}`}
      timeLeft={session.timeLeft}
      value={value}
      onChange={setValue}
      onConfirm={handleConfirm}
      onBack={handleBack}
      error={error}
      finishGame={session.winner !== null}
      submitting={submitting}
    />
  );
};