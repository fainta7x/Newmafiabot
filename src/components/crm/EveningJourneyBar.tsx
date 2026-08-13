import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Gamepad2, Users } from 'lucide-react';
import { api, type EveningParticipant, type GameEvening } from '../../lib/api.ts';
import { getEveningResponse } from '../../lib/eveningResponse.ts';
import type { EveningSection } from './EveningWorkspace.tsx';

type EveningData = GameEvening & {
  participants?: EveningParticipant[];
  games?: Array<{ id: string | number; status?: string | null; protocol_status?: string | null; winner_team?: string | null }>;
};

type NextStep = {
  title: string;
  detail: string;
  label: string;
  target: EveningSection;
  tone: 'accent' | 'warning' | 'success';
};

const stages = ['Подготовка', 'Сбор', 'Игра', 'Итог'];

export default function EveningJourneyBar({ eveningId, onOpenSection }: { eveningId: string; onOpenSection: (section: EveningSection) => void }) {
  const [evening, setEvening] = useState<EveningData | null>(null);

  const load = useCallback(async () => {
    try {
      setEvening(await api.getEvening(eveningId) as EveningData);
    } catch {
      // The workspace itself owns detailed loading errors; this helper should stay non-blocking.
    }
  }, [eveningId]);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const state = useMemo(() => {
    if (!evening) return null;
    const participants = evening.participants || [];
    const expected = participants.filter((item) => ['going', 'late'].includes(getEveningResponse(item)));
    const pending = expected.filter((item) => item.attendance_status === 'pending');
    const attended = participants.filter((item) => item.attendance_status === 'attended');
    const games = evening.games || [];
    const completed = games.filter((game) => game.status === 'completed' || game.protocol_status === 'completed' || Boolean(game.winner_team)).length;
    const unfinished = Math.max(0, games.length - completed);
    const readonly = evening.status === 'completed' || Boolean(evening.settled_at);

    let index = 0;
    let next: NextStep = {
      title: 'Подготовить вечер', detail: 'Проверь основные данные и публикацию.', label: 'Открыть обзор', target: 'overview', tone: 'accent',
    };

    if (evening.status === 'published') {
      index = 1;
      next = expected.length
        ? { title: 'Состав собирается', detail: `${expected.length} подтвердили участие. Перед стартом проверь состав и явку.`, label: 'Проверить состав', target: 'participants', tone: 'accent' }
        : { title: 'Нужны ответы игроков', detail: 'Вечер опубликован, но подтверждённого состава пока нет.', label: 'Открыть состав', target: 'participants', tone: 'warning' };
    } else if (evening.status === 'active') {
      index = 2;
      if (pending.length) {
        next = { title: 'Отметить явку', detail: `У ${pending.length} ожидаемых игроков ещё нет факта прихода.`, label: 'Отметить явку', target: 'participants', tone: 'warning' };
      } else if (unfinished) {
        next = { title: 'Завершить текущие игры', detail: `${unfinished} созданных игр ещё без финального результата.`, label: 'Перейти к играм', target: 'games', tone: 'warning' };
      } else if (games.length) {
        next = { title: 'Можно закрывать вечер', detail: `${completed} игр завершено, явка заполнена.`, label: 'Финальная проверка', target: 'overview', tone: 'success' };
      } else {
        next = { title: 'Запустить первую игру', detail: `${attended.length} игроков отмечены в клубе.`, label: 'Перейти к играм', target: 'games', tone: 'accent' };
      }
    } else if (readonly) {
      index = 3;
      next = { title: 'Вечер зафиксирован', detail: `${completed} игр сохранено в истории клуба.`, label: 'Посмотреть итог', target: 'overview', tone: 'success' };
    }

    return { index, next, expected: expected.length, attended: attended.length, games: completed };
  }, [evening]);

  if (!state || evening?.status === 'cancelled') return null;

  const tone = state.next.tone === 'warning'
    ? 'border-warning/25 bg-warning-soft'
    : state.next.tone === 'success'
      ? 'border-success/25 bg-success-soft'
      : 'border-accent/20 bg-accent-soft/30';

  return <section className={`rounded-[16px] border p-3 ${tone}`}>
    <div className="grid grid-cols-4 gap-1.5">
      {stages.map((label, index) => {
        const done = index < state.index;
        const current = index === state.index;
        return <div key={label} className="min-w-0 text-center"><div className={`mx-auto grid h-6 w-6 place-items-center rounded-full text-[9px] font-black ${done ? 'bg-success text-white' : current ? 'bg-accent text-white' : 'bg-surface-2 text-text-muted'}`}>{done ? '✓' : index + 1}</div><div className={`mt-1 truncate text-[8px] font-semibold ${current ? 'text-text-primary' : 'text-text-muted'}`}>{label}</div></div>;
      })}
    </div>

    <div className="mt-3 flex items-start gap-3 rounded-[13px] bg-surface-1/70 p-3">
      <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-accent">{state.index === 3 ? <CheckCircle2 className="h-4 w-4" /> : state.index === 2 ? <Gamepad2 className="h-4 w-4" /> : <Users className="h-4 w-4" />}</div>
      <div className="min-w-0 flex-1"><div className="text-[11px] font-black text-text-primary">Следующий шаг · {state.next.title}</div><div className="mt-0.5 text-[9px] leading-4 text-text-muted">{state.next.detail}</div><div className="mt-1 text-[8px] text-text-muted">Подтвердили {state.expected} · пришли {state.attended} · игр {state.games}</div></div>
      <button type="button" onClick={() => onOpenSection(state.next.target)} className="min-h-9 shrink-0 rounded-[10px] bg-accent px-2.5 text-[9px] font-black text-white">{state.next.label}</button>
    </div>
  </section>;
}
