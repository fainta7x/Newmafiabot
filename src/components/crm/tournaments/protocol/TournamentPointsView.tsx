import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { PlayerResultData } from '../../../../lib/api';
import { calculateDisciplinaryPenalty } from '../../../../lib/gameDiscipline';
import { Card, Eyebrow, SeatBadge } from '../../gameProtocol/ui';
import type { ProtocolApi } from '../../gameProtocol/types';
import { LockedNote } from '../../gameProtocol/PlayersView';
import { teamOfRole } from '../../gameProtocol/protocolReview';
import { PointStepper, roundTenths } from './PointStepper';

const signed = (value: number) => {
  const rounded = roundTenths(value);
  return rounded > 0 ? `+${rounded}` : rounded < 0 ? `−${Math.abs(rounded)}` : '0';
};

type Props = {
  api: ProtocolApi;
  /** Players whose old technical fouls have no type yet: how many fouls to classify. */
  oldTechFouls: Record<string, number>;
  onClassify: (participantId: string, minor: number, major: number) => void;
};

/** The judge's points of a tournament game: what the protocol earns, what the judge adds, and the old fouls that still need a type. */
export const TournamentPointsView: React.FC<Props> = ({ api, oldTechFouls, onClassify }) => {
  const { protocol } = api;
  const sorted = api.results.slice().sort((a, b) => a.seat_number - b.seat_number);
  const step = (player: PlayerResultData, field: 'protocol_bonus' | 'judge_bonus', label: string) => (
    <div data-testid={field === 'judge_bonus' ? `judge-bonus-${player.participant_id}` : undefined} className="rounded-2xl bg-black/25 p-3">
      <div className="mb-1.5 text-[12px] text-white/55">{label}</div>
      <PointStepper
        value={player[field] ?? 0} min={-1} max={1} step={0.1} disabled={api.locked}
        ariaLabelMinus={`Уменьшить ${label.toLowerCase()}`} ariaLabelPlus={`Увеличить ${label.toLowerCase()}`}
        formatValue={signed}
        onChange={(value) => api.updateResult(player.participant_id, { [field]: roundTenths(value) } as Partial<PlayerResultData>)}
      />
    </div>
  );
  return (
    <div className="space-y-4">
      {api.locked ? <LockedNote /> : null}
      <p className="px-1 text-[13px] leading-5 text-white/55">Баллы судьи за каждого игрока: за протокол и дополнительные. Фолы и техфолы меняются во вкладке «Игроки».</p>
      <ul className="space-y-3">
        {sorted.map((player) => {
          const penalty = calculateDisciplinaryPenalty(player.minor_technical_fouls || 0, player.major_technical_fouls || 0, player.exit_type === 'removed', protocol.ppk_culprit_participant_id === player.participant_id);
          const pendingOld = oldTechFouls[player.participant_id];
          return (
            <li key={player.participant_id}>
              <Card className="space-y-3" testId={`points-${player.participant_id}`}>
                <div className="flex items-center gap-3">
                  <SeatBadge seat={player.seat_number} team={teamOfRole(player.role)} size="sm" />
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{player.display_name}</div><div className="text-[12px] text-white/45">Дисциплинарный минус: {penalty}</div></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {step(player, 'protocol_bonus', 'Балл за протокол')}
                  {step(player, 'judge_bonus', 'Балл судьи')}
                </div>
                {player.participant_id === protocol.first_killed_participant_id ? <p className="rounded-xl border border-sky-300/20 bg-sky-300/[0.06] px-3 py-2 text-[12px] leading-4 text-sky-100">Коэффициент Ci первого убитого считается автоматически по лучшему ходу.</p> : null}
                {pendingOld !== undefined ? (
                  <div className="rounded-2xl border border-amber-300/25 bg-amber-300/[0.07] p-3">
                    <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-amber-100"><AlertTriangle className="h-4 w-4" aria-hidden="true" />Старые техфолы: тип не указан ({pendingOld})</div>
                    <div className="flex flex-wrap gap-2">
                      {(pendingOld === 1 ? [['1 малый', 1, 0], ['1 большой', 0, 1]] : pendingOld === 2 ? [['2 малых', 2, 0], ['малый + большой', 1, 1], ['2 больших', 0, 2]] : []).map(([label, minor, major]) => (
                        <button key={String(label)} type="button" disabled={api.locked} onClick={() => onClassify(player.participant_id, Number(minor), Number(major))} className="min-h-11 rounded-xl border border-white/10 bg-white/[0.07] px-3 text-[13px] font-semibold text-white/85 disabled:opacity-40">{label}</button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <label className="block text-[12px] text-white/50">
                  <Eyebrow className="mb-1">Заметка об игроке</Eyebrow>
                  <input type="text" disabled={api.locked} value={player.notes || ''} placeholder="Заметка о действиях игрока..." onChange={(event) => api.updateResult(player.participant_id, { notes: event.target.value || null })} className="min-h-11 w-full rounded-xl border border-white/10 bg-[#14161c] px-3 text-sm text-white placeholder:text-white/30" />
                </label>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
