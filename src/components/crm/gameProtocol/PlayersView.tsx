import React from 'react';
import { ChevronRight, Lock } from 'lucide-react';
import type { PlayerResultData } from '../../../lib/api';
import { Btn, Card, Eyebrow, SeatBadge, SeatGrid, Segmented, Sheet, Stepper, cx } from './ui';
import type { ProtocolApi } from './types';
import { teamOfRole, type Issue } from './protocolReview';
import { deriveExitTypes } from '../tournaments/protocol/protocolStateUtils';
import { BestMoveTag, ConfirmedTag, ExitTag, FirstKilledTag, FoulTag, InfoTag, NeedsTag, PpkTag, RoleTag } from './tags';

const ROLE_OPTIONS = [
  { value: 'citizen', label: 'Мирный' },
  { value: 'sheriff', label: 'Шериф' },
  { value: 'mafia', label: 'Мафия' },
  { value: 'don', label: 'Дон' },
];

const EXIT_OPTIONS = [
  { value: 'alive', label: 'В игре' },
  { value: 'killed', label: 'Убит' },
  { value: 'voted_day', label: 'Заголосован' },
  { value: 'voted_zero_round', label: 'В нулевом' },
  { value: 'removed', label: 'Удалён' },
];

type MarkKey = 'red' | 'black' | 'sheriff';
const MARKS: Array<{ key: MarkKey; label: string; hint: string }> = [
  { key: 'red', label: 'Красные', hint: 'кого игрок считал красными' },
  { key: 'black', label: 'Чёрные', hint: 'кого игрок считал чёрными' },
  { key: 'sheriff', label: 'Шериф', hint: 'кого игрок считал Шерифом (одного)' },
];

const marksOf = (player: PlayerResultData): Record<MarkKey, number[]> => {
  const out: Record<MarkKey, number[]> = { red: [], black: [], sheriff: [] };
  for (const entry of player.color_protocol || []) out[entry.mark as MarkKey] = [...(entry.seat_numbers || [])];
  return out;
};

const toColorProtocol = (marks: Record<MarkKey, number[]>): PlayerResultData['color_protocol'] =>
  MARKS.filter((item) => marks[item.key].length).map((item) => ({ mark: item.key, seat_numbers: [...marks[item.key]].sort((a, b) => a - b) })) as PlayerResultData['color_protocol'];

/** What the votes, the shots and the first-killed mark say about how the player left, or null when they say nothing. */
export const recordedExit = (api: ProtocolApi, player: PlayerResultData): PlayerResultData['exit_type'] | null => {
  const derived = deriveExitTypes((api.protocol.votes || []) as any[], (api.protocol.shots || []) as any[], api.protocol.first_killed_participant_id ?? null, api.results).get(player.seat_number);
  return derived && derived !== 'alive' ? (derived as PlayerResultData['exit_type']) : null;
};

type ListProps = { api: ProtocolApi; issues: Issue[]; onOpen: (seat: number) => void };

export const PlayersList: React.FC<ListProps> = ({ api, issues, onOpen }) => {
  const sorted = api.results.slice().sort((a, b) => a.seat_number - b.seat_number);
  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {sorted.map((player) => {
          const team = teamOfRole(player.role);
          const out = player.exit_type !== 'alive';
          const flagged = issues.some((issue) => issue.seat === player.seat_number);
          const isPpk = api.protocol.end_reason === 'ppk' && api.protocol.ppk_culprit_participant_id === player.participant_id;
          const tech = (player.minor_technical_fouls || 0) + (player.major_technical_fouls || 0);
          const isFirstKilled = api.protocol.first_killed_participant_id === player.participant_id;
          const hasMove = (api.protocol.best_moves || []).some((move) => move.participant_id === player.participant_id && (move.seat_numbers || []).length > 0);
          return (
            <li key={player.participant_id}>
              <button type="button" onClick={() => onOpen(player.seat_number)} aria-label={`Игрок ${player.seat_number} ${player.display_name}, открыть`} className="flex min-h-[72px] w-full items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.035] px-3 py-2 text-left transition-colors hover:bg-white/[0.06]">
                <SeatBadge seat={player.seat_number} team={team} dim={out} />
                <span className="min-w-0 flex-1 py-0.5">
                  <span className={cx('block truncate text-[15px] font-semibold', out && 'text-white/65')}>{player.display_name}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-1">
                    <RoleTag role={player.role} />
                    <ExitTag exit={player.exit_type} />
                    {player.exit_type === 'killed' ? ((player.color_protocol || []).length ? <ConfirmedTag>Протокол убитого</ConfirmedTag> : player.role === 'mafia' || player.role === 'don' ? null : <NeedsTag>Нет протокола убитого</NeedsTag>) : null}
                    {isFirstKilled ? <FirstKilledTag /> : null}
                    {hasMove ? <BestMoveTag /> : null}
                    {isPpk ? <PpkTag /> : null}
                    {tech ? <FoulTag count={tech} kind="minor" /> : null}
                    {flagged ? <NeedsTag>Проверить</NeedsTag> : null}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1" role="img" aria-label={`Фолов: ${player.regular_fouls || 0}`}>
                  {[0, 1, 2, 3].map((i) => <span key={i} className={cx('h-2 w-2 rounded-full', i < (player.regular_fouls || 0) ? 'bg-amber-300' : 'bg-white/15')} />)}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-white/30" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export const LockedNote: React.FC = () => (
  <Card className="flex items-center gap-3 p-3.5 text-[13px] leading-5 text-white/60"><Lock className="h-4 w-4 shrink-0" aria-hidden="true" />Игра подтверждена. Чтобы править, верните её на исправление в «Обзоре».</Card>
);

type SheetProps = { api: ProtocolApi; seat: number | null; onClose: () => void };

export const PlayerSheet: React.FC<SheetProps> = ({ api, seat, onClose }) => {
  const player = seat == null ? null : api.results.find((item) => item.seat_number === seat) || null;
  if (!player) return <Sheet open={false} title="" onClose={onClose}>{null}</Sheet>;
  const locked = api.locked;
  const isKilled = player.exit_type === 'killed';
  const marks = marksOf(player);
  const hasMarks = MARKS.some((item) => marks[item.key].length);
  const isPpk = api.protocol.end_reason === 'ppk' && api.protocol.ppk_culprit_participant_id === player.participant_id;
  const removedByJudge = player.removal_reason === 'direct';
  const tech = (player.minor_technical_fouls || 0) + (player.major_technical_fouls || 0);

  const recorded = recordedExit(api, player);
  const setMark = (key: MarkKey, target: number) => {
    const next = { red: [...marks.red], black: [...marks.black], sheriff: [...marks.sheriff] };
    const has = next[key].includes(target);
    if (has) next[key] = next[key].filter((value) => value !== target);
    else {
      if (key === 'sheriff') next.sheriff = [target];
      else next[key] = [...next[key], target];
      if (key === 'red') next.black = next.black.filter((value) => value !== target);
      if (key === 'black') next.red = next.red.filter((value) => value !== target);
    }
    api.updateResult(player.participant_id, { color_protocol: toColorProtocol(next) });
  };

  return (
    <Sheet open title={`#${player.seat_number} ${player.display_name}`} onClose={onClose}>
      <div className="space-y-5 pb-2 pt-1">
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Состояние игрока"><RoleTag role={player.role} /><ExitTag exit={player.exit_type} />{isPpk ? <PpkTag /> : null}{tech ? <FoulTag count={tech} kind="minor" /> : null}{(player.regular_fouls || 0) ? <FoulTag count={player.regular_fouls || 0} /> : null}{removedByJudge ? <InfoTag tone="removed">Удалён судьёй</InfoTag> : null}</div>
        {locked ? <LockedNote /> : null}

        {recorded && recorded !== player.exit_type ? (
          <div className="flex items-center gap-3 rounded-2xl border border-amber-300/20 bg-amber-300/[0.07] p-3" role="alert">
            <div className="min-w-0 flex-1 text-[13px] leading-5">По записи игры: <ExitTag exit={recorded} /> В карточке стоит другой статус.</div>
            <Btn kind="soft" disabled={locked} className="shrink-0 px-3 text-[13px]" onClick={() => api.updateResult(player.participant_id, { exit_type: recorded })}>Как в записи</Btn>
          </div>
        ) : null}

        <section aria-label="Роль" className="space-y-2">
          <Eyebrow>Роль</Eyebrow>
          <Segmented label="Роль" disabled={locked} value={player.role || ''} options={ROLE_OPTIONS} cols={4} onChange={(value) => api.updateResult(player.participant_id, { role: value })} />
        </section>

        <section aria-label="Как вышел" className="space-y-2">
          <Eyebrow>Как вышел</Eyebrow>
          <Segmented label="Как вышел" disabled={locked} value={player.exit_type} options={EXIT_OPTIONS} cols={3} onChange={(value) => api.updateResult(player.participant_id, value === 'removed' ? { exit_type: 'removed', removal_reason: 'direct' } : { exit_type: value as PlayerResultData['exit_type'], removal_reason: null })} />
          <p className="text-[12px] leading-4 text-white/40">Обычно это считается из голосований и ночей; вручную стоит менять, только если запись неполная.</p>
        </section>

        <section aria-label="Нарушения" className="space-y-2">
          <Eyebrow>Фолы и техфолы</Eyebrow>
          <div className="space-y-1"><div className="text-[12px] text-white/50">Фолы</div><Stepper label="Фолы" value={player.regular_fouls || 0} disabled={locked} onMinus={() => api.changeRegularFoul(player, -1)} onPlus={() => api.changeRegularFoul(player, 1)} minusDisabled={(player.regular_fouls || 0) <= 0} plusDisabled={(player.regular_fouls || 0) >= 4} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><div className="text-[12px] text-white/50">Малые техфолы</div><Stepper label="Малые техфолы" value={player.minor_technical_fouls || 0} disabled={locked} onMinus={() => api.changeTechFoul(player, 'minor', -1)} onPlus={() => api.changeTechFoul(player, 'minor', 1)} minusDisabled={(player.minor_technical_fouls || 0) <= 0} plusDisabled={tech >= 2} /></div>
            <div className="space-y-1"><div className="text-[12px] text-white/50">Большие техфолы</div><Stepper label="Большие техфолы" value={player.major_technical_fouls || 0} disabled={locked} onMinus={() => api.changeTechFoul(player, 'major', -1)} onPlus={() => api.changeTechFoul(player, 'major', 1)} minusDisabled={(player.major_technical_fouls || 0) <= 0} plusDisabled={tech >= 2} /></div>
          </div>
        </section>

        {isKilled || hasMarks ? (
          <section aria-label="Протокол убитого" className="space-y-3">
            <Eyebrow>Протокол убитого</Eyebrow>
            {!isKilled ? <p className="text-[12px] text-amber-100/80">Игрок уже не помечен убитым, но отметки сохранены.</p> : null}
            {MARKS.map((item) => (
              <div key={item.key} className="space-y-1.5">
                <div className="flex items-baseline justify-between"><span className="text-[13px] font-semibold">{item.label}</span><span className="text-[11px] text-white/40">{item.hint}</span></div>
                <SeatGrid label={item.label} selected={marks[item.key]} disabled={locked} size={api.tableSize} hidden={[player.seat_number]} tone={item.key === 'black' ? 'night' : item.key === 'red' ? 'bad' : 'neutral'} onToggle={(target) => setMark(item.key, target)} />
              </div>
            ))}
          </section>
        ) : null}

        <section aria-label="Решения судьи" className="space-y-2">
          <Eyebrow>Решения судьи</Eyebrow>
          <div className="grid grid-cols-2 gap-2">
            {isPpk
              ? <Btn kind="ghost" disabled={locked} onClick={() => api.cancelPpk()}>Отменить ППК</Btn>
              : <Btn kind="danger" disabled={locked || api.protocol.end_reason === 'ppk'} onClick={() => api.causePpk(player)}>ППК</Btn>}
            {removedByJudge
              ? <Btn kind="ghost" disabled={locked} onClick={() => api.cancelRemoval(player)}>Отменить удаление</Btn>
              : <Btn kind="danger" disabled={locked || player.exit_type === 'removed'} onClick={() => api.removeByJudge(player)}>Удалить судьёй</Btn>}
          </div>
        </section>
      </div>
    </Sheet>
  );
};
