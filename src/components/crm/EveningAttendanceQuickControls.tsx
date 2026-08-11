import React, { useEffect, useMemo, useState } from 'react';
import { api, type EveningParticipant } from '../../lib/api.ts';
import {
  EVENING_ATTENDANCE_LABELS,
  EVENING_RESPONSE_LABELS,
  getEveningAttendanceFact,
  getEveningResponse,
  type EveningAttendanceFact,
  type EveningResponseStatus,
} from '../../lib/eveningResponse.ts';

const RESPONSE_GROUPS: Array<{
  status: EveningResponseStatus;
  label: string;
  emptyLabel: string;
}> = [
  { status: 'going', label: 'Идут', emptyLabel: 'Никто пока не подтвердил' },
  { status: 'late', label: 'Придут позже', emptyLabel: 'Никто не планирует позже' },
  { status: 'thinking', label: 'Пока думают', emptyLabel: 'Никто не думает' },
  { status: 'unanswered', label: 'Не ответили', emptyLabel: 'Все уже ответили' },
  { status: 'declined', label: 'Не идут', emptyLabel: 'Отказов нет' },
];

export const EveningAttendanceQuickControls: React.FC<{ eveningId: string }> = ({ eveningId }) => {
  const [participants, setParticipants] = useState<EveningParticipant[]>([]);
  const [readonly, setReadonly] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const data = await api.getEvening(eveningId);
      setParticipants(data.participants || []);
      setReadonly(data.status === 'completed' || Boolean(data.settled_at));
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Не удалось загрузить статусы');
    }
  };

  useEffect(() => {
    void load();
  }, [eveningId]);

  const expected = useMemo(
    () => participants.filter((p) => ['going', 'late'].includes(getEveningResponse(p))).length,
    [participants],
  );
  const arrived = useMemo(
    () => participants.filter((p) => getEveningAttendanceFact(p).startsWith('attended_')).length,
    [participants],
  );

  const groupedParticipants = useMemo(() => {
    const groups = new Map<EveningResponseStatus, EveningParticipant[]>();
    for (const group of RESPONSE_GROUPS) groups.set(group.status, []);

    for (const participant of participants) {
      const response = getEveningResponse(participant);
      const list = groups.get(response) || groups.get('unanswered')!;
      list.push(participant);
    }

    for (const list of groups.values()) {
      list.sort((a, b) => String(a.nickname || '').localeCompare(String(b.nickname || ''), 'ru'));
    }
    return groups;
  }, [participants]);

  const patch = async (p: EveningParticipant, body: Record<string, string>) => {
    if (readonly || busy) return;
    setBusy(p.id);
    try {
      const updated = await api.updateParticipant(p.id, body as any);
      setParticipants((list) => list.map((item) => (item.id === p.id ? updated : item)));
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Не удалось сохранить статус');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="min-w-0 overflow-x-hidden rounded-[18px] border border-border-soft bg-surface-1 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-black text-text-primary">Ответ и фактическая явка</h3>
          <p className="mt-1 text-[11px] text-text-secondary">Сначала те, кто планирует прийти. Явка отмечается отдельно в день игры.</p>
        </div>
        <span className="text-[11px] font-bold text-text-muted">Ожидаем {expected} · пришли {arrived}</span>
      </div>

      {error ? <p className="mt-2 rounded-xl bg-danger-soft px-3 py-2 text-[11px] text-danger">{error}</p> : null}

      <div className="mt-4 space-y-4">
        {RESPONSE_GROUPS.map((group) => {
          const items = groupedParticipants.get(group.status) || [];
          if (items.length === 0) return null;

          return (
            <div key={group.status} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <strong className="text-[11px] font-black text-text-primary">{group.label}</strong>
                <span className="rounded-full border border-border-soft bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-text-muted">
                  {items.length}
                </span>
              </div>

              {items.map((p) => {
                const response = getEveningResponse(p);
                const fact = getEveningAttendanceFact(p);
                return (
                  <div key={p.id} className="min-w-0 rounded-2xl border border-border-soft bg-surface-2 p-3">
                    <div className="min-w-0">
                      <strong className="block truncate text-[12px] text-text-primary">{p.nickname}</strong>
                      <span className="text-[10px] text-text-muted">{EVENING_ATTENDANCE_LABELS[fact]}</span>
                    </div>

                    <div className="mt-2 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                      <select
                        disabled={readonly || busy === p.id}
                        value={response}
                        onChange={(e) => void patch(p, { response_status: e.target.value })}
                        className="min-h-[44px] min-w-0 w-full rounded-xl border border-border-soft bg-surface-1 px-3 text-[12px] text-text-primary"
                      >
                        {(Object.keys(EVENING_RESPONSE_LABELS) as EveningResponseStatus[]).map((status) => (
                          <option key={status} value={status}>{EVENING_RESPONSE_LABELS[status]}</option>
                        ))}
                      </select>

                      <div className="grid min-w-0 grid-cols-2 gap-1.5 sm:grid-cols-4">
                        {([
                          ['attended_on_time', 'Вовремя'],
                          ['attended_late', 'Позже'],
                          ['no_show', 'Не пришёл'],
                          ['pending', 'Сбросить'],
                        ] as Array<[EveningAttendanceFact, string]>).map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            disabled={readonly || busy === p.id}
                            onClick={() => void patch(p, { attendance_fact: value })}
                            className={`min-h-[44px] min-w-0 rounded-xl border px-2 text-[10px] font-bold ${
                              fact === value
                                ? 'border-accent bg-accent-soft text-text-primary'
                                : 'border-border-soft bg-surface-1 text-text-secondary'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
};
