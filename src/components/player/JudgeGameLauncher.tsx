import { useEffect, useMemo, useState } from 'react';
import { EVENING_FORMAT_LABELS, normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { clubGamesApi, type ClubGameRecord } from '../../lib/clubGamesApi.ts';
import { PlayerAvatar } from '../ui/PlayerAvatar.tsx';
import JudgeTestGameModal from './JudgeTestGameModal.tsx';

export type JudgeStartParticipant = {
  id: string;
  player_id: string;
  nickname: string;
  response_status: string;
  attendance_fact: 'pending' | 'attended_on_time' | 'attended_late' | 'no_show';
  table_id: string | null;
  avatar_updated_at?: string | null;
};

export type JudgeStartEvening = {
  id: string;
  title: string;
  starts_at: string;
  venue: string | null;
  format: string;
  status: 'published' | 'active';
  games_count: number;
  tables: Array<{ id: string; name: string; host_name?: string | null }>;
  participants: JudgeStartParticipant[];
};

type Props = {
  judge: { id: string; nickname: string };
  evenings: JudgeStartEvening[];
  onCreated: (game: ClubGameRecord) => void;
};

const formatWhen = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(date);
};

const attendanceLabel = (participant: JudgeStartParticipant) => {
  if (participant.attendance_fact === 'attended_late') return 'Пришёл позже';
  if (participant.attendance_fact === 'attended_on_time') return 'На месте';
  if (participant.response_status === 'late') return 'Обещал позже';
  if (participant.response_status === 'going') return 'Идёт';
  if (participant.response_status === 'thinking') return 'Думает';
  return 'Не отмечен';
};

export default function JudgeGameLauncher({ judge, evenings, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testFeedback, setTestFeedback] = useState<string | null>(null);
  const [eveningId, setEveningId] = useState(evenings[0]?.id || '');
  const [tableId, setTableId] = useState('');
  const [lineup, setLineup] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const evening = evenings.find((item) => item.id === eveningId) || evenings[0] || null;
  const byId = useMemo(() => new Map((evening?.participants || []).map((item) => [item.id, item])), [evening]);
  const selected = useMemo(() => lineup.map((id) => byId.get(id)).filter(Boolean) as JudgeStartParticipant[], [byId, lineup]);
  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('ru-RU');
    return (evening?.participants || []).filter((item) => !q || item.nickname.toLocaleLowerCase('ru-RU').includes(q));
  }, [evening, query]);

  useEffect(() => {
    if (eveningId && evenings.some((item) => item.id === eveningId)) return;
    setEveningId(evenings[0]?.id || '');
  }, [eveningId, evenings]);

  useEffect(() => {
    setLineup([]);
    setQuery('');
    setError(null);
    setTableId(evening?.tables[0]?.id || '');
  }, [evening?.id]);

  const toggle = (participantId: string) => {
    setLineup((current) => {
      if (current.includes(participantId)) return current.filter((id) => id !== participantId);
      if (current.length >= 10) return current;
      return [...current, participantId];
    });
  };

  const shuffle = () => {
    setLineup((current) => {
      const next = current.slice();
      for (let index = next.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(Math.random() * (index + 1));
        [next[index], next[swap]] = [next[swap], next[index]];
      }
      return next;
    });
  };

  const create = async () => {
    if (!evening || lineup.length !== 10 || creating) return;
    setCreating(true);
    setError(null);
    try {
      const game = await clubGamesApi.create(evening.id, {
        evening_table_id: tableId || null,
        judge_player_id: judge.id,
        judge_name: judge.nickname,
        seats: lineup.map((participantId, index) => ({ participant_id: participantId, seat_number: index + 1 })),
      });
      setOpen(false);
      setLineup([]);
      onCreated(game);
    } catch (createError: any) {
      setError(createError?.message || 'Не удалось создать игру');
    } finally {
      setCreating(false);
    }
  };

  if (testOpen) {
    return (
      <JudgeTestGameModal
        judge={judge}
        onClose={(completed) => {
          setTestOpen(false);
          if (completed) setTestFeedback('Тест завершён. Результат не сохранён и не попал в статистику.');
        }}
      />
    );
  }

  if (!open) {
    return (
      <section className="rounded-3xl border border-emerald-300/15 bg-gradient-to-b from-emerald-300/[0.07] to-white/[0.025] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100/45">Самостоятельное ведение</div>
            <h3 className="mt-2 text-lg font-semibold text-white">Начать новую игру</h3>
            <p className="mt-1 text-sm leading-5 text-white/35">
              Клубная игра привязывается к вечеру. Тестовая запускает тот же движок локально и ничего не записывает в клубную статистику.
            </p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-300/[0.08] text-xl">▶</div>
        </div>
        {testFeedback && <div className="mt-3 rounded-2xl bg-emerald-300/[0.07] px-3 py-2.5 text-xs leading-5 text-emerald-100/65">{testFeedback}</div>}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={evenings.length === 0}
            onClick={() => setOpen(true)}
            className="min-h-12 rounded-2xl bg-white px-3 text-xs font-semibold text-black disabled:bg-white/[0.07] disabled:text-white/25"
          >
            {evenings.length ? 'Клубная игра' : 'Нет вечера'}
          </button>
          <button
            type="button"
            onClick={() => { setTestFeedback(null); setTestOpen(true); }}
            className="min-h-12 rounded-2xl border border-amber-200/20 bg-amber-200/[0.08] px-3 text-xs font-semibold text-amber-100"
          >
            Тестовая игра
          </button>
        </div>
        {evenings.length === 0 && <p className="mt-2 text-center text-xs leading-4 text-white/30">Для тестовой игры опубликованный вечер не нужен.</p>}
      </section>
    );
  }

  return (
    <div className="fixed inset-0 z-[145] overflow-y-auto bg-[#090a0d]/98 p-3 text-white backdrop-blur-xl sm:p-5">
      <div className="mx-auto w-full max-w-lg space-y-3 pb-8">
        <div className="flex items-start justify-between gap-3 rounded-3xl border border-white/10 bg-white/[0.045] p-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">Судейская</div>
            <h2 className="mt-1 text-xl font-semibold">Новая клубная игра</h2>
            <p className="mt-1 text-xs leading-5 text-white/35">Вы ведёте игру от своего профиля · {judge.nickname}</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="h-10 w-10 rounded-xl border border-white/10 bg-white/[0.05] text-white/50">✕</button>
        </div>

        {error && <div className="rounded-2xl bg-rose-400/[0.08] px-3 py-3 text-sm text-rose-100/80">{error}</div>}

        <section className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.045] p-4">
          <label className="block">
            <span className="mb-1.5 block text-xs text-white/40">Игровой вечер</span>
            <select value={evening?.id || ''} onChange={(event) => setEveningId(event.target.value)} className="min-h-12 w-full rounded-2xl border border-white/10 bg-[#15161b] px-3 text-sm text-white">
              {evenings.map((item) => <option key={item.id} value={item.id}>{item.title} · {formatWhen(item.starts_at)}</option>)}
            </select>
          </label>
          {evening && (
            <div className="flex flex-wrap gap-2 text-xs text-white/45">
              <span className="rounded-full bg-black/25 px-2.5 py-1">{EVENING_FORMAT_LABELS[normalizeEveningFormat(evening.format)]}</span>
              <span className="rounded-full bg-black/25 px-2.5 py-1">{evening.status === 'active' ? 'Идёт сейчас' : 'Опубликован'}</span>
              <span className="rounded-full bg-black/25 px-2.5 py-1">Игр: {evening.games_count}</span>
              {evening.venue && <span className="rounded-full bg-black/25 px-2.5 py-1">📍 {evening.venue}</span>}
            </div>
          )}
          {evening && evening.tables.length > 0 && (
            <label className="block">
              <span className="mb-1.5 block text-xs text-white/40">Стол</span>
              <select value={tableId} onChange={(event) => setTableId(event.target.value)} className="min-h-11 w-full rounded-2xl border border-white/10 bg-[#15161b] px-3 text-sm text-white">
                <option value="">Без указания</option>
                {evening.tables.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}
              </select>
            </label>
          )}
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-3">
          <div className="flex items-center justify-between gap-3">
            <div><div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/40">Рассадка</div><div className="mt-1 text-sm text-white/55">{lineup.length}/10 игроков</div></div>
            <button type="button" disabled={lineup.length < 2} onClick={shuffle} className="min-h-10 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-xs font-medium text-white/60 disabled:opacity-25">Перемешать</button>
          </div>
          <div className="mt-3 grid grid-cols-5 gap-1.5">
            {Array.from({ length: 10 }, (_, index) => {
              const participant = selected[index];
              return <button key={index} type="button" disabled={!participant} onClick={() => participant && toggle(participant.id)} className={`min-h-16 min-w-0 rounded-xl border p-1.5 text-center ${participant ? 'border-white/20 bg-white/[0.08]' : 'border-white/[0.07] bg-black/20'}`}><div className="text-[9px] text-white/30">#{index + 1}</div><div className="mt-2 truncate text-[9px] font-semibold text-white/70">{participant?.nickname || '—'}</div></button>;
            })}
          </div>
          <p className="mt-3 text-[11px] leading-4 text-white/30">Порядок выбора — места 1–10. Нажмите на место, чтобы убрать игрока.</p>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-3">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти игрока вечера" className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            {visible.map((participant) => {
              const seat = lineup.indexOf(participant.id);
              const chosen = seat >= 0;
              return (
                <button key={participant.id} type="button" onClick={() => toggle(participant.id)} className={`flex min-w-0 items-center gap-2 rounded-2xl border p-2.5 text-left ${chosen ? 'border-emerald-300/25 bg-emerald-300/[0.08]' : 'border-white/10 bg-black/20'}`}>
                  <PlayerAvatar playerId={participant.player_id} avatarVersion={participant.avatar_updated_at} nickname={participant.nickname} size="sm" />
                  <span className="min-w-0 flex-1"><strong className="block truncate text-xs text-white">{participant.nickname}</strong><span className="mt-0.5 block truncate text-[9px] text-white/30">{attendanceLabel(participant)}</span></span>
                  {chosen && <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white text-[10px] font-black text-black">{seat + 1}</span>}
                </button>
              );
            })}
          </div>
          {visible.length === 0 && <p className="py-8 text-center text-sm text-white/35">Игроки не найдены.</p>}
        </section>

        <div className="rounded-2xl border border-amber-200/10 bg-amber-200/[0.04] px-3 py-3 text-xs leading-5 text-amber-50/45">
          Создание игры подтверждает фактическое присутствие выбранной десятки. Если игрок ответил «приду позже», он будет отмечен как пришедший позже; остальные — как пришедшие вовремя.
        </div>

        <button type="button" disabled={lineup.length !== 10 || creating} onClick={() => void create()} className="min-h-14 w-full rounded-2xl bg-white px-4 text-sm font-black text-black disabled:bg-white/[0.07] disabled:text-white/25">
          {creating ? 'Создаём игру…' : lineup.length === 10 ? 'Создать игру и открыть ведение' : `Выберите ещё ${10 - lineup.length}`}
        </button>
      </div>
    </div>
  );
}
