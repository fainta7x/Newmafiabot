import React from 'react';
import type { PlayerResultData, ShotEntry } from '../../../lib/api';
import { normalizeGameRole } from '../../../shared/gameRoles';
import { Btn, Eyebrow, Segmented } from './ui';

export function MissAssessmentEditor({ shot, players, locked, onChange }: {
  shot: ShotEntry; players: PlayerResultData[]; locked: boolean;
  onChange: (reason: 'error' | 'intentional' | null, responsible: number[]) => void;
}) {
  if (shot.result === 'killed') return null;
  const blacks = players.filter((player) => ['mafia', 'don'].includes(normalizeGameRole(player.role) || ''));
  const chosen = shot.miss_responsible_seats || [];
  return <section className="space-y-3" aria-label="Оценка промаха">
    <Eyebrow>Причина промаха</Eyebrow>
    <Segmented label="Причина промаха" disabled={locked} value={shot.miss_reason || 'unassessed'} cols={3}
      options={[{ value: 'unassessed', label: 'Не оценён' }, { value: 'error', label: 'Ошибка' }, { value: 'intentional', label: 'Тактика' }]}
      onChange={(value) => onChange(value === 'unassessed' ? null : value as 'error' | 'intentional', value === 'error' ? chosen : [])} />
    {shot.miss_reason === 'error' ? <>
      <p className="text-[12px] leading-relaxed text-white/60">Выберите виновника или всю чёрную команду. Каждый выбранный игрок потеряет 2 ЭЛО, только если чёрные проиграют.</p>
      <div className="space-y-2" role="group" aria-label="Ответственные за промах">
        {blacks.map((player) => <button key={player.participant_id} type="button" disabled={locked}
          aria-pressed={chosen.includes(player.seat_number)}
          onClick={() => onChange('error', chosen.includes(player.seat_number) ? chosen.filter((seat) => seat !== player.seat_number) : [...chosen, player.seat_number])}
          className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm disabled:opacity-40 ${chosen.includes(player.seat_number) ? 'border-violet-300/40 bg-violet-300/15 text-white' : 'border-white/10 bg-white/5 text-white/70'}`}>
          <span className="min-w-0 break-words">#{player.seat_number} {player.display_name}</span><span aria-hidden="true">{chosen.includes(player.seat_number) ? '✓' : '○'}</span>
        </button>)}
      </div>
      <Btn kind="soft" block disabled={locked} onClick={() => onChange('error', blacks.map((player) => player.seat_number))}>Вся чёрная команда</Btn>
    </> : <p className="text-[12px] leading-relaxed text-white/55">{shot.miss_reason === 'intentional' ? 'Осознанный пропуск выстрела не даёт штрафа.' : 'Пока причина и виновники не указаны, личного штрафа за промах нет.'}</p>}
  </section>;
}
