import React, { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { LiveGameEvent } from '../../../shared/liveGameEvents';
import { finalRevealsOfEvents, revealVersions } from '../../../lib/revealStats';
import { Btn, Card, Eyebrow, SeatBadge, SeatGrid, Segmented, Sheet } from './ui';
import type { ProtocolApi } from './types';
import { LockedNote } from './PlayersView';
import { teamOfRole } from './protocolReview';
import { InfoTag, RoleTag } from './tags';

const NIGHT_PHASE = /^night_(\d+)$/;

/** The checks a black player announced, one per night, in the order of the nights; a check written by the live game has no night number and takes its place in the order it was announced. */
export const nightChecksOf = (events: LiveGameEvent[], seat: number): Array<{ night: number; target: number; color: 'red' | 'black' }> => {
  const alive = new Map<number, LiveGameEvent>();
  for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
    if (event.seat !== seat || !event.target) continue;
    if (event.kind === 'announced_check' && (event.value === 'red' || event.value === 'black')) alive.set(event.target, event);
    else if (event.kind === 'announced_check_removed') alive.delete(event.target);
  }
  const used = new Set<number>();
  for (const event of alive.values()) { const m = NIGHT_PHASE.exec(event.phase || ''); if (m) used.add(Number(m[1])); }
  let next = 1;
  return [...alive.values()].map((event) => {
    const m = NIGHT_PHASE.exec(event.phase || '');
    if (m) return { night: Number(m[1]), target: event.target as number, color: event.value as 'red' | 'black' };
    while (used.has(next)) next += 1;
    used.add(next);
    return { night: next, target: event.target as number, color: event.value as 'red' | 'black' };
  }).sort((a, b) => a.night - b.night);
};

const nextSeq = (events: LiveGameEvent[]) => events.reduce((max, event) => Math.max(max, event.seq), 0) + 1;

/**
 * «Вскрытия»: who openly said he is the Sheriff and which checks he announced (owner, 2026-10-12, BUSINESS_RULES). The
 * record is the same events the live game writes; one reveal is one version of the table, two or more are competing versions.
 */
export const RevealsCard: React.FC<{ api: ProtocolApi }> = ({ api }) => {
  const events = (Array.isArray(api.protocol.events) ? api.protocol.events : []) as LiveGameEvent[];
  const records = useMemo(() => [...finalRevealsOfEvents(events).values()].sort((a, b) => a.since - b.since || a.seat - b.seat), [events]);
  const [open, setOpen] = useState<number | 'new' | null>(null);
  const player = (seat: number) => api.results.find((item) => item.seat_number === seat);
  const name = (seat: number) => player(seat)?.display_name || '';
  const maxRound = Math.max(2, ...events.map((event) => event.round));

  const edit = (updater: (list: LiveGameEvent[]) => LiveGameEvent[]) => api.setEvents(updater);
  const push = (list: LiveGameEvent[], event: Omit<LiveGameEvent, 'seq' | 'at' | 'phase'>): LiveGameEvent[] => [...list, { ...event, seq: nextSeq(list), at: new Date().toISOString(), phase: 'day_voting' }];
  const addReveal = (seat: number) => edit((list) => push(list, { round: maxRound, kind: 'reveal', seat }));
  const removeReveal = (seat: number) => edit((list) => push(list, { round: maxRound, kind: 'reveal_removed', seat }));
  /** Night `night` of this black player: who he named and which colour; target null clears the night. */
  const setNightCheck = (seat: number, night: number, target: number | null, color: 'red' | 'black') => edit((list) => {
    let next = list;
    const old = nightChecksOf(list, seat).find((item) => item.night === night);
    if (old) next = push(next, { round: maxRound, kind: 'announced_check_removed', seat, target: old.target });
    if (target === null) return next;
    const dup = nightChecksOf(next, seat).find((item) => item.target === target);
    if (dup) next = push(next, { round: maxRound, kind: 'announced_check_removed', seat, target });
    return [...next, { seq: nextSeq(next), at: new Date().toISOString(), round: maxRound, phase: `night_${night}`, kind: 'announced_check', seat, target, value: color }];
  });

  const sheriff = api.results.find((item) => item.role === 'sheriff') || null;
  const isBlack = (seat: number) => teamOfRole(player(seat)?.role) === 'black';
  const blackRecords = records.filter((record) => isBlack(record.seat));
  const toVersion = (record: { seat: number; checks: Map<number, 'red' | 'black'> }) => ({ seat: record.seat, checks: [...record.checks].map(([target, color]) => ({ target, color })) });
  const sheriffRecord = sheriff ? records.find((record) => record.seat === sheriff.seat_number) : null;
  const versions = revealVersions([...(sheriff ? [sheriffRecord ? toVersion(sheriffRecord) : { seat: sheriff.seat_number, checks: [] }] : []), ...blackRecords.map(toVersion)]);
  const nights = Math.max(1, (api.protocol.shots || []).length);
  const sheetRecord = typeof open === 'number' ? records.find((record) => record.seat === open) : null;

  const sheetChecks = sheetRecord ? nightChecksOf(events, sheetRecord.seat) : [];
  return (
    <Card className="space-y-3">
      <div className="flex items-baseline justify-between gap-2"><Eyebrow>Вскрытия</Eyebrow><InfoTag tone="info">{blackRecords.length + 1 === 1 ? 'Игра в одной версии' : `Версий: ${blackRecords.length + 1}`}</InfoTag></div>
      <p className="text-[12px] leading-4 text-white/45">Шериф вскрывается всегда — это первая версия. Каждый чёрный, назвавший себя Шерифом, — ещё одна версия.</p>
      {sheriff ? <div className="flex min-h-12 items-center gap-3 rounded-2xl bg-black/25 px-3 py-2"><SeatBadge seat={sheriff.seat_number} team="red" size="sm" /><span className="min-w-0 flex-1 text-sm font-semibold">{sheriff.display_name} <span className="font-normal text-white/45">· Шериф, версия 1</span></span></div> : null}
      {api.locked ? <LockedNote /> : null}
      {blackRecords.length === 0 ? <p className="text-[13px] leading-5 text-white/55">Чёрные не вскрывались: игра в одной версии. Если чёрный назвал себя Шерифом, добавьте его.</p> : (
        <ul className="space-y-2">
          {blackRecords.map((record, index) => (
            <li key={record.seat}>
              <button type="button" onClick={() => setOpen(record.seat)} className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-black/25 px-3 py-2 text-left" aria-label={`Вскрытие игрока ${record.seat}, открыть`}>
                <SeatBadge seat={record.seat} team={teamOfRole(player(record.seat)?.role)} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">{name(record.seat)}<RoleTag role={player(record.seat)?.role} /><span className="text-[12px] font-normal text-white/45">версия {index + 2}</span></span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {record.checks.size === 0 ? <span className="text-[12px] text-white/40">проверки не названы</span> : nightChecksOf(events, record.seat).map((item) => <InfoTag key={item.target} tone={item.color === 'black' ? 'night' : 'vote'}>Ночь {item.night}: #{item.target} {item.color === 'black' ? 'чёрный' : 'красный'}</InfoTag>)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {blackRecords.length ? (
        <div className="space-y-1.5 rounded-2xl border border-sky-300/15 bg-sky-300/[0.05] p-3">
          <div className="text-[13px] font-semibold">Как читать стол</div>
          {versions.map((version) => (
            <p key={version.claimant} className="text-[12px] leading-5 text-white/65">
              Если Шериф #{version.claimant}: чёрные {version.blacks.map((seat) => `#${seat}`).join(', ') || '—'}{version.reds.length ? `; красные ${version.reds.map((seat) => `#${seat}`).join(', ')}` : ''}
            </p>
          ))}
        </div>
      ) : null}
      <Btn kind="ghost" block disabled={api.locked} onClick={() => setOpen('new')}><Plus className="h-4 w-4" aria-hidden="true" />Добавить вскрытие чёрного</Btn>

      <Sheet open={open === 'new'} title="Кто из чёрных вскрылся?" subtitle="Чёрный игрок, назвавший себя Шерифом" onClose={() => setOpen(null)}>
        <div className="pb-2 pt-1"><SeatGrid label="Вскрылся" size={api.tableSize} disabled={api.locked} selected={[]} hidden={[...api.results.filter((item) => teamOfRole(item.role) !== 'black').map((item) => item.seat_number), ...records.map((record) => record.seat)]} onToggle={(seat) => { addReveal(seat); setOpen(seat); }} /></div>
      </Sheet>

      <Sheet open={!!sheetRecord} title={sheetRecord ? `Вскрытие #${sheetRecord.seat} ${name(sheetRecord.seat)}` : ''} subtitle="Проверки по ночам: кого назвал и каким цветом" onClose={() => setOpen(null)}>
        {sheetRecord ? (
          <div className="space-y-4 pb-2 pt-1">
            {api.locked ? <LockedNote /> : null}
            <p className="text-[12px] leading-5 text-white/55">Так же, как Шериф, чёрный «проверяет» по ночам. Отметьте по ночам, кого он назвал проверенным и какой цвет объявил: порядок ночей важен для разбора игры.</p>
            {Array.from({ length: Math.min(10, Math.max(nights, sheetChecks.length + 1)) }, (_, index) => index + 1).map((night) => {
              const item = sheetChecks.find((entry) => entry.night === night);
              const taken = new Set(sheetChecks.filter((entry) => entry.night !== night).map((entry) => entry.target));
              return (
                <div key={night} className="space-y-1.5 rounded-2xl bg-black/25 p-3">
                  <label htmlFor={`night-${night}`} className="block text-[13px] font-semibold">Ночь {night}</label>
                  <select id={`night-${night}`} aria-label={`Ночь ${night}: кого проверил`} disabled={api.locked} value={item?.target ?? ''} onChange={(event) => setNightCheck(sheetRecord.seat, night, event.target.value ? Number(event.target.value) : null, item?.color || 'red')} className="min-h-11 w-full rounded-xl border border-white/10 bg-[#14161c] px-3 text-sm text-white">
                    <option value="">Не называл</option>
                    {api.results.filter((player2) => player2.seat_number !== sheetRecord.seat && !taken.has(player2.seat_number)).sort((a, b) => a.seat_number - b.seat_number).map((player2) => <option key={player2.seat_number} value={player2.seat_number}>#{player2.seat_number} {player2.display_name}</option>)}
                  </select>
                  {item ? <Segmented label={`Ночь ${night}: названный цвет`} disabled={api.locked} value={item.color} options={[{ value: 'red', label: 'Красный', tone: 'bad' as const }, { value: 'black', label: 'Чёрный', tone: 'night' as const }]} cols={2} onChange={(next) => setNightCheck(sheetRecord.seat, night, item.target, next === 'black' ? 'black' : 'red')} /> : null}
                </div>
              );
            })}
            <Btn kind="danger" block disabled={api.locked} onClick={() => { removeReveal(sheetRecord.seat); setOpen(null); }}><X className="h-4 w-4" aria-hidden="true" />Убрать вскрытие</Btn>
          </div>
        ) : null}
      </Sheet>
    </Card>
  );
};
