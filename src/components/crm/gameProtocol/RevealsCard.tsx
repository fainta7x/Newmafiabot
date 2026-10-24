import React, { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { LiveGameEvent } from '../../../shared/liveGameEvents';
import { finalRevealsOfEvents, revealVersions } from '../../../lib/revealStats';
import { Btn, Card, Eyebrow, SeatBadge, SeatGrid, Segmented, Sheet } from './ui';
import type { ProtocolApi } from './types';
import { LockedNote } from './PlayersView';
import { teamOfRole } from './protocolReview';
import { InfoTag, RoleTag } from './tags';

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
  const setCheck = (seat: number, target: number, color: 'red' | 'black' | null) => edit((list) => {
    const current = records.find((record) => record.seat === seat)?.checks.get(target);
    if (color === null) return current ? push(list, { round: maxRound, kind: 'announced_check_removed', seat, target }) : list;
    if (current === color) return list;
    return push(list, { round: maxRound, kind: 'announced_check', seat, target, value: color });
  });

  const versions = revealVersions(records.map((record) => ({ seat: record.seat, checks: [...record.checks].map(([target, color]) => ({ target, color })) })));
  const isBlack = (seat: number) => teamOfRole(player(seat)?.role) === 'black';
  const sheetRecord = typeof open === 'number' ? records.find((record) => record.seat === open) : null;

  return (
    <Card className="space-y-3">
      <div className="flex items-baseline justify-between gap-2"><Eyebrow>Вскрытия</Eyebrow><InfoTag tone="info">{records.length === 0 ? 'Вскрытий нет' : `Вскрытий: ${records.length}`}</InfoTag></div>
      <div className="space-y-1.5"><div className="text-[13px] font-semibold">Игра в одной или в двух версиях?</div>
        <Segmented label="Версии игры" disabled={api.locked} value={String(api.protocol.reveal_versions ?? '')} options={[{ value: '', label: 'Не указано' }, { value: '1', label: 'Одна' }, { value: '2', label: 'Две' }]} cols={3} onChange={(value) => api.setRevealVersions(value === '1' ? 1 : value === '2' ? 2 : null)} />
        <p className="text-[12px] leading-4 text-white/45">Две версии — когда чёрный назвал себя Шерифом против настоящего. Тогда нужно выбрать, кто из чёрных вскрылся, и его проверки.</p>
      </div>
      {api.locked ? <LockedNote /> : null}
      {records.length === 0 ? <p className="text-[13px] leading-5 text-white/55">Никто не называл себя Шерифом. Если вскрытие было (Шериф или чёрный), добавьте его.</p> : (
        <ul className="space-y-2">
          {records.map((record) => (
            <li key={record.seat}>
              <button type="button" onClick={() => setOpen(record.seat)} className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-black/25 px-3 py-2 text-left" aria-label={`Вскрытие игрока ${record.seat}, открыть`}>
                <SeatBadge seat={record.seat} team={teamOfRole(player(record.seat)?.role)} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">{name(record.seat)}<RoleTag role={player(record.seat)?.role} /></span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {record.checks.size === 0 ? <span className="text-[12px] text-white/40">проверки не названы</span> : [...record.checks].map(([target, color]) => <InfoTag key={target} tone={color === 'black' ? 'night' : 'vote'}>#{target} {color === 'black' ? 'чёрный' : 'красный'}</InfoTag>)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {versions.length ? (
        <div className="space-y-1.5 rounded-2xl border border-sky-300/15 bg-sky-300/[0.05] p-3">
          <div className="text-[13px] font-semibold">Версии стола</div>
          {versions.map((version) => (
            <p key={version.claimant} className="text-[12px] leading-5 text-white/65">
              Если Шериф #{version.claimant}: чёрные {version.blacks.map((seat) => `#${seat}`).join(', ') || '—'}{version.reds.length ? `; красные ${version.reds.map((seat) => `#${seat}`).join(', ')}` : ''}
            </p>
          ))}
          {!records.some((record) => isBlack(record.seat)) ? <p className="text-[12px] text-amber-100/80">Среди вскрывшихся нет чёрного игрока — проверьте роли.</p> : null}
        </div>
      ) : null}
      <Btn kind="ghost" block disabled={api.locked} onClick={() => setOpen('new')}><Plus className="h-4 w-4" aria-hidden="true" />Добавить вскрытие</Btn>

      <Sheet open={open === 'new'} title="Кто вскрылся?" subtitle="Игрок, назвавший себя Шерифом: настоящий Шериф или чёрный" onClose={() => setOpen(null)}>
        <div className="pb-2 pt-1"><SeatGrid label="Вскрылся" size={api.tableSize} disabled={api.locked} selected={[]} hidden={records.map((record) => record.seat)} onToggle={(seat) => { addReveal(seat); setOpen(seat); }} /></div>
      </Sheet>

      <Sheet open={!!sheetRecord} title={sheetRecord ? `Вскрытие #${sheetRecord.seat} ${name(sheetRecord.seat)}` : ''} subtitle="Кого он назвал и каким цветом" onClose={() => setOpen(null)}>
        {sheetRecord ? (
          <div className="space-y-4 pb-2 pt-1">
            {api.locked ? <LockedNote /> : null}
            {api.results.filter((item) => item.seat_number !== sheetRecord.seat).sort((a, b) => a.seat_number - b.seat_number).map((item) => {
              const value = sheetRecord.checks.get(item.seat_number) || '';
              return (
                <div key={item.seat_number} className="flex items-center gap-2">
                  <SeatBadge seat={item.seat_number} team={teamOfRole(item.role)} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{item.display_name}</span>
                  <div className="w-44 shrink-0"><Segmented label={`Названный цвет игрока ${item.seat_number}`} disabled={api.locked} value={value} options={[{ value: '', label: '—' }, { value: 'red', label: 'Красн.' }, { value: 'black', label: 'Чёрн.' }]} cols={3} onChange={(next) => setCheck(sheetRecord.seat, item.seat_number, next === 'red' || next === 'black' ? next : null)} /></div>
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
