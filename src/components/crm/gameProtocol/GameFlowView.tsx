import React, { useMemo, useState } from 'react';
import { Check, ChevronRight, Plus } from 'lucide-react';
import type { LiveGameEvent } from '../../../shared/liveGameEvents';
import type { VotingRound } from '../../../shared/tournamentVoting';
import { determineVotingResult } from '../../../shared/tournamentVoting';
import { zeroRoundBreakerSeat } from '../../../shared/liveGameEvents';
import { moveNominatedSeat, setTableLeaveVotes, setVotingSeatCount, toggleNominatedSeat, updateEligibleVoters } from '../tournaments/protocol/protocolVotingEditorUtils';
import { Btn, Card, Eyebrow, SeatBadge, SeatGrid, Segmented, Sheet, Stepper, cx } from './ui';
import type { ProtocolApi } from './types';
import { LockedNote } from './PlayersView';
import { BestMoveTag, CheckAnswerTag, ConfirmedTag, ExitTag, FirstKilledTag, InfoTag, NeedsTag } from './tags';
import { checksOf, circleTitle, roleAtTable, describeVoting, exitLabel, exitsOf, foulsOf, nominatorsOf, tableVotersOf, plural, roundBallots, roundChain, teamOfRole, withBallots, type CircleModel, type Issue } from './protocolReview';

type Props = {
  api: ProtocolApi;
  circles: CircleModel[];
  circleIndex: number;
  onCircle: (index: number) => void;
  reviewed: Record<number, boolean>;
  onToggleReviewed: (circle: number) => void;
  issues: Issue[];
};

type Sheets =
  | { type: 'ballot'; round: number; voter: number }
  | { type: 'round'; round: number }
  | { type: 'shot'; index: number }
  | { type: 'first-killed' }
  | { type: 'check'; kind: 'don' | 'sheriff' }
  | null;

const SHOT_OPTIONS = [
  { value: 'killed', label: 'Убит' },
  { value: 'miss', label: 'Промах' },
  { value: 'agreement_failed', label: 'Не договорились' },
];

const CANDIDATE_TONES = ['bg-white/12 text-white', 'bg-rose-300/[0.16] text-rose-50', 'bg-sky-300/[0.16] text-sky-50', 'bg-violet-300/[0.16] text-violet-50', 'bg-amber-300/[0.16] text-amber-50'];

const votingTitle = (position: number) => (position === 0 ? 'Голосование' : position === 1 ? 'Переголосование' : `Переголосование ${position}`);

export const GameFlowView: React.FC<Props> = ({ api, circles, circleIndex, onCircle, reviewed, onToggleReviewed, issues }) => {
  const [sheet, setSheet] = useState<Sheets>(null);
  const circle = circles[Math.min(circleIndex, circles.length - 1)];
  const protocol = api.protocol;
  const votes = (protocol.votes || []) as unknown as VotingRound[];
  const nameOf = (seat: number) => api.results.find((player) => player.seat_number === seat)?.display_name || '';
  const teamOf = (seat: number) => teamOfRole(api.results.find((player) => player.seat_number === seat)?.role);
  const nominators = useMemo(() => nominatorsOf(circle.events), [circle]);
  const checks = useMemo(() => checksOf(circle.events), [circle]);
  const exits = useMemo(() => exitsOf(circle.events), [circle]);
  const fouls = useMemo(() => foulsOf(circle.events), [circle]);
  const chains = circle.rootRounds.map((root) => roundChain(protocol, root));
  const shot = circle.shotIndex >= 0 ? protocol.shots?.[circle.shotIndex] : null;
  const canAddNight = circle.shotIndex < 0 && circle.index === (protocol.shots || []).length;
  const close = () => setSheet(null);
  const circleIssues = issues.filter((issue) => issue.circle === circle.index);

  const roundView = (index: number) => {
    const round = votes[index];
    const eligible = round.eligible_voters ?? api.tableSize;
    const nominated = (round.nominated_seats || []).map(Number);
    const counts = round.vote_counts || {};
    const sum = nominated.reduce((total, seat) => total + Number(counts[seat] || 0), 0);
    const result = determineVotingResult(round);
    const day = Number(round.day_number ?? 0);
    const clubBreak = api.zeroRoundRule === 'club' && day === 0 && result.outcome === 'single_eliminated';
    const calculated = clubBreak ? 'no_elimination' : result.resolvedOutcome || (result.outcome === 'requires_table_decision' ? 'pending' : result.outcome);
    return { round, eligible, nominated, counts, sum, result, day, calculated, confirmed: !!round.outcome && round.outcome !== 'pending' };
  };

  const ballotsOf = (index: number, position: number) => roundBallots(protocol, votes[index], circle.index, position);

  const renderVotingCard = (index: number, position: number) => {
    const view = roundView(index);
    const ballots = ballotsOf(index, position);
    const clubBreak = api.zeroRoundRule === 'club' && view.day === 0 && view.result.outcome === 'single_eliminated';
    const summary = describeVoting(view.round, view.eligible, clubBreak, (seat) => `#${seat} ${nameOf(seat)}`.trim());
    const complete = view.sum === view.eligible && view.nominated.length > 0;
    const top = Math.max(0, ...view.nominated.map((seat) => Number(view.counts[seat] || 0)));
    const tone = (order: number) => CANDIDATE_TONES[order % CANDIDATE_TONES.length];
    const orderOf = (seat: number) => view.nominated.indexOf(seat);
    const voterRows = ballots ? Object.entries(ballots).map(([voter, target]) => ({ voter: Number(voter), target: Number(target) })).sort((a, b) => a.voter - b.voter) : [];
    const outcomeChip = view.confirmed ? <ConfirmedTag>Результат подтверждён</ConfirmedTag> : complete ? <NeedsTag>Нужно подтвердить</NeedsTag> : <InfoTag>Не закончено</InfoTag>;
    return (
      <Card key={index} className="space-y-4" testId={`round-card-${index}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><h3 className="text-base font-semibold leading-6">{votingTitle(position)}</h3><div className="text-[12px] text-white/45">{plural(view.eligible, ['голосующий', 'голосующих', 'голосующих'])}</div></div>
          <Btn kind="ghost" onClick={() => setSheet({ type: 'round', round: index })} disabled={api.locked} className="shrink-0 px-3 text-[13px]">Изменить</Btn>
        </div>

        {view.nominated.length === 0 ? <p className="rounded-2xl bg-black/25 px-3 py-3 text-[13px] text-white/50">Кандидаты не выбраны. Нажмите «Изменить» и отметьте выставленных.</p> : (
          <>
            <div className="rounded-2xl bg-black/25 p-3.5">
              <div className="mb-2.5">{outcomeChip}</div>
              <p className="text-[15px] font-semibold leading-6" data-testid="voting-summary">{summary}</p>
            </div>

            <ul className="space-y-3" aria-label="Голоса за кандидатов">
              {view.nominated.map((seat) => {
                const count = Number(view.counts[seat] || 0);
                const leader = complete && count === top && top > 0;
                const by = nominators[seat];
                return (
                  <li key={seat}>
                    <div className="flex items-center gap-3">
                      <SeatBadge seat={seat} team={teamOf(seat)} size="sm" />
                      <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{nameOf(seat) || `Игрок ${seat}`}</div>{by && position === 0 ? <div className="text-[12px] text-white/45">выставил #{by} {nameOf(by)}</div> : null}</div>
                      <div className="text-right"><div className={cx('text-xl font-semibold tabular-nums leading-6', leader ? 'text-white' : 'text-white/70')}>{count}</div><div className="text-[11px] text-white/40">{plural(count, ['голос', 'голоса', 'голосов']).replace(/^\d+ /, '')}</div></div>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10" aria-hidden="true"><div className={cx('h-full rounded-full', leader ? 'bg-white' : 'bg-white/35')} style={{ width: `${view.eligible ? Math.min(100, (count / view.eligible) * 100) : 0}%` }} /></div>
                  </li>
                );
              })}
            </ul>

            {voterRows.length ? (
              <div>
                <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-white/45">Кто за кого</h4>
                <ul className="grid grid-cols-1 gap-1.5 min-[560px]:grid-cols-2">
                  {voterRows.map((row) => (
                    <li key={row.voter}>
                      <button type="button" disabled={api.locked} aria-label={`Голос игрока ${row.voter} ${nameOf(row.voter)} за ${row.target}: изменить`} onClick={() => setSheet({ type: 'ballot', round: index, voter: row.voter })} className="flex min-h-11 w-full items-center gap-2.5 rounded-xl bg-white/[0.04] px-2.5 text-left hover:bg-white/[0.08] disabled:cursor-default disabled:hover:bg-white/[0.04]">
                        <SeatBadge seat={row.voter} team={teamOf(row.voter)} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-[13px] text-white/80">{nameOf(row.voter)}</span>
                        <span className="text-white/30" aria-hidden="true">→</span>
                        <span className={cx('max-w-[44%] shrink-0 truncate rounded-lg px-2 py-1 text-[12px] font-semibold', tone(orderOf(row.target)))}>{nameOf(row.target) || `#${row.target}`}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {!api.locked ? <p className="mt-2 text-[12px] leading-4 text-white/40">Нажмите на строку, чтобы изменить голос. Данные из записи игры.</p> : null}
              </div>
            ) : <p className="text-[12px] leading-4 text-white/40">Кто за кого голосовал, для этого голосования не записано. Число голосов можно поправить через «Изменить».</p>}

            <div className="border-t border-white/8 pt-3">
              {view.confirmed ? (
                <Btn kind="ghost" block disabled={api.locked} onClick={() => api.resetOutcome(index)}>Сбросить результат</Btn>
              ) : (
                <Btn kind="primary" block disabled={api.locked || !complete || view.calculated === 'pending'} onClick={() => api.confirmOutcome(index, view.calculated as string, view.result.winners)}>Подтвердить результат</Btn>
              )}
            </div>
          </>
        )}
      </Card>
    );
  };

  const nightRow = (label: string, value: React.ReactNode, tone: 'ok' | 'warn' | 'quiet', onClick?: () => void, note?: string) => {
    const body = (
      <>
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] text-white/45">{label}</span>
          <span className={cx('mt-0.5 block text-[15px] font-semibold leading-5', tone === 'warn' ? 'text-amber-100' : tone === 'quiet' ? 'text-white/50' : 'text-white')}>{value}</span>
          {note ? <span className="mt-0.5 block text-[11px] text-white/35">{note}</span> : null}
        </span>
        {onClick ? <ChevronRight className="h-4 w-4 shrink-0 text-white/30" aria-hidden="true" /> : null}
      </>
    );
    const base = cx('flex min-h-14 w-full items-center gap-3 rounded-2xl border px-3.5 py-2 text-left', tone === 'warn' ? 'border-amber-300/20 bg-amber-300/[0.07]' : 'border-white/8 bg-black/20');
    return onClick ? <button type="button" disabled={api.locked} onClick={onClick} className={cx(base, 'hover:bg-white/[0.05] disabled:cursor-default')}>{body}</button> : <div className={base}>{body}</div>;
  };

  const shotText = shot ? (
    <span className="flex flex-wrap items-center gap-2">
      {shot.target_seat ? <span>#{shot.target_seat} {nameOf(shot.target_seat)}</span> : null}
      {shot.result === 'killed' ? <ExitTag exit="killed" /> : shot.result === 'miss' ? <InfoTag tone="attention">Промах</InfoTag> : <InfoTag tone="attention">Не договорились</InfoTag>}
    </span>
  ) : null;
  const firstKilled = api.results.find((player) => player.participant_id === protocol.first_killed_participant_id) || null;
  const zeroVoted = api.results.find((player) => player.participant_id === protocol.zero_round_voted_participant_id) || null;
  const bestMoveOf = (source: 'first_killed' | 'zero_round_voted') => (protocol.best_moves || []).find((move) => move.source === source)?.seat_numbers || [];
  const breaker = zeroRoundBreakerSeat(protocol.events);
  const donHere = roleAtTable(protocol, api.results, 'don', circle.index);
  const sheriffHere = roleAtTable(protocol, api.results, 'sheriff', circle.index);

  // ----- sheets -----
  const ballotSheet = () => {
    if (!sheet || sheet.type !== 'ballot') return null;
    const view = roundView(sheet.round);
    const position = chains.findIndex((chain) => chain.includes(sheet.round));
    const inChain = position >= 0 ? chains[position].indexOf(sheet.round) : 0;
    const ballots = ballotsOf(sheet.round, inChain) || {};
    const current = ballots[sheet.voter];
    return (
      <Sheet open title={`Голос игрока #${sheet.voter}`} subtitle={`${nameOf(sheet.voter)} · ${circleTitle(circle.index)}. За кого он голосовал?`} onClose={close} footer={<Btn kind="soft" big block onClick={close}>Закрыть</Btn>}>
        <div className="space-y-2 pb-2 pt-1">
          {view.nominated.map((seat) => (
            <button key={seat} type="button" aria-pressed={current === seat} onClick={() => { api.changeRound(sheet.round, (round) => withBallots(round, { ...ballots, [sheet.voter]: seat })); close(); }} className={cx('flex min-h-14 w-full items-center gap-3 rounded-2xl border px-3.5 text-left', current === seat ? 'border-white bg-white text-[#090a0d]' : 'border-white/10 bg-white/[0.05] text-white')}>
              <SeatBadge seat={seat} team={teamOf(seat)} size="sm" /><span className="flex-1 text-[15px] font-semibold">{nameOf(seat) || `Игрок ${seat}`}</span>{current === seat ? <Check className="h-5 w-5" aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      </Sheet>
    );
  };

  const roundSheet = () => {
    if (!sheet || sheet.type !== 'round') return null;
    const index = sheet.round;
    const view = roundView(index);
    const position = chains.findIndex((chain) => chain.includes(index));
    const inChain = position >= 0 ? chains[position].indexOf(index) : 0;
    const hasBallots = !!ballotsOf(index, inChain);
    const isRevote = !!view.round.is_revote;
    const tableVoters = tableVotersOf(circle.events);
    return (
      <Sheet open title={votingTitle(inChain)} subtitle={circleTitle(circle.index)} onClose={close}>
        <div className="space-y-5 pb-2 pt-1">
          {api.locked ? <LockedNote /> : null}
          <section className="space-y-2" aria-label="Кандидаты">
            <Eyebrow>Кандидаты</Eyebrow>
            <SeatGrid label="Кандидаты" size={api.tableSize} disabled={api.locked || isRevote} selected={view.nominated} onToggle={(seat) => api.changeRound(index, (round) => toggleNominatedSeat(round, seat))} />
            {isRevote ? <p className="text-[12px] text-white/40">Кандидаты переголосования берутся из ничьей предыдущего голосования.</p> : null}
            {view.nominated.length > 1 ? (
              <div className="space-y-1.5 pt-2" role="group" aria-label="Порядок кандидатов">
                <div className="text-[12px] text-white/45">Порядок на голосовании</div>
                {view.nominated.map((seat, order) => (
                  <div key={seat} className="flex min-h-12 items-center gap-2 rounded-2xl bg-white/[0.05] pl-3.5 pr-1.5 text-sm font-semibold">
                    <span className="w-5 text-white/40 tabular-nums">{order + 1}</span><span className="flex-1">#{seat} {nameOf(seat)}</span>
                    <button type="button" aria-label={`Сдвинуть #${seat} раньше`} disabled={api.locked || isRevote || order === 0} onClick={() => api.changeRound(index, (round) => moveNominatedSeat(round, seat, 'earlier'))} className="h-11 w-11 rounded-xl text-lg text-white/70 hover:bg-white/10 disabled:opacity-25">↑</button>
                    <button type="button" aria-label={`Сдвинуть #${seat} позже`} disabled={api.locked || isRevote || order === view.nominated.length - 1} onClick={() => api.changeRound(index, (round) => moveNominatedSeat(round, seat, 'later'))} className="h-11 w-11 rounded-xl text-lg text-white/70 hover:bg-white/10 disabled:opacity-25">↓</button>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          {!isRevote && view.day > 0 ? (
            <section className="space-y-2" aria-label="Голосующих"><Eyebrow>Голосующих</Eyebrow>
              <Stepper label="Голосующих" value={view.eligible} disabled={api.locked} minusDisabled={view.eligible <= 1} plusDisabled={view.eligible >= api.tableSize} onMinus={() => api.changeRound(index, (round) => updateEligibleVoters(round, String(view.eligible - 1)))} onPlus={() => api.changeRound(index, (round) => updateEligibleVoters(round, String(view.eligible + 1)))} />
            </section>
          ) : null}

          {view.nominated.length > 0 ? (
            <section className="space-y-2" aria-label="Голоса"><Eyebrow>Голоса · {view.sum} из {view.eligible}</Eyebrow>
              {hasBallots ? <p className="text-[12px] leading-4 text-white/45">Числа считаются по голосам игроков: меняйте голос у конкретного игрока.</p> : (
                view.nominated.map((seat, position2) => {
                  const last = position2 === view.nominated.length - 1 && view.nominated.length >= 1;
                  const value = Number(view.counts[seat] || 0);
                  return (
                    <div key={seat} className="space-y-1"><div className="text-[12px] text-white/50">#{seat} {nameOf(seat)}{last ? ' · остаток считается сам' : ''}</div>
                      <Stepper label={`Голоса за ${seat}`} value={value} disabled={api.locked || last} minusDisabled={value <= 0} plusDisabled={value >= view.eligible} onMinus={() => api.changeRound(index, (round) => setVotingSeatCount(round, seat, value - 1))} onPlus={() => api.changeRound(index, (round) => setVotingSeatCount(round, seat, value + 1))} />
                    </div>
                  );
                })
              )}
            </section>
          ) : null}

          {view.result.outcome === 'requires_table_decision' ? (
            <section className="space-y-2" aria-label="Решение стола"><Eyebrow>Голосов за уход всех спорных</Eyebrow>
              <Stepper label="Голосов за уход" value={view.round.table_leave_votes ?? 0} disabled={api.locked} minusDisabled={(view.round.table_leave_votes ?? 0) <= 0} plusDisabled={(view.round.table_leave_votes ?? 0) >= view.eligible} onMinus={() => api.changeRound(index, (round) => setTableLeaveVotes(round, Math.max(0, (round.table_leave_votes ?? 0) - 1)))} onPlus={() => api.changeRound(index, (round) => setTableLeaveVotes(round, Math.min(view.eligible, (round.table_leave_votes ?? 0) + 1)))} />
              <p className="text-[12px] text-white/40">Для ухода нужно большинство: {Math.floor(view.eligible / 2) + 1}.</p>
            </section>
          ) : null}

          {!isRevote && view.nominated.length > 0 ? (
            <section className="space-y-2" aria-label="Кто выдвинул"><Eyebrow>Кто выдвинул</Eyebrow>
              {view.nominated.map((seat) => (
                <div key={seat} className="flex items-center gap-2">
                  <SeatBadge seat={seat} team={teamOf(seat)} size="sm" /><span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{nameOf(seat)}</span>
                  <select aria-label={`Кто выдвинул игрока ${seat}`} disabled={api.locked} value={nominators[seat] ?? ''} onChange={(event) => writeEvents((list) => { const kept = list.filter((item) => !(item.round === roundNo && item.kind === 'nomination' && item.seat === seat)); return event.target.value ? addEvent(kept, { kind: 'nomination', phase: 'day_voting', seat, by: Number(event.target.value) }) : kept; })} className="min-h-11 w-40 shrink-0 rounded-xl border border-white/10 bg-[#14161c] px-2 text-[13px] text-white">
                    <option value="">Не указано</option>
                    {api.results.slice().sort((a, b) => a.seat_number - b.seat_number).map((player) => <option key={player.seat_number} value={player.seat_number}>#{player.seat_number} {player.display_name}</option>)}
                  </select>
                </div>
              ))}
            </section>
          ) : null}

          {view.result.outcome === 'requires_table_decision' ? (
            <section className="space-y-2" aria-label="Кто за «поднять»"><Eyebrow>Кто за «поднять»</Eyebrow>
              <SeatGrid label="Кто за поднять" size={api.tableSize} disabled={api.locked} selected={tableVoters} tone="bad" onToggle={(seat) => {
                const next = tableVoters.includes(seat) ? tableVoters.filter((value) => value !== seat) : [...tableVoters, seat];
                writeEvents((list) => addEvent(list, { kind: tableVoters.includes(seat) ? 'table_vote_removed' : 'table_vote', phase: 'day_voting', seat }));
                api.changeRound(index, (round) => setTableLeaveVotes(round, next.length));
              }} />
              <p className="text-[12px] text-white/40">Отмеченные игроки подсчитываются в «Голосов за уход» выше.</p>
            </section>
          ) : null}

          <Btn kind="danger" block disabled={api.locked} onClick={() => { api.deleteVoting(index); close(); }}>{isRevote ? 'Удалить переголосование' : 'Удалить голосование'}</Btn>
        </div>
      </Sheet>
    );
  };

  const shotSheet = () => {
    if (!sheet || sheet.type !== 'shot') return null;
    const entry = protocol.shots?.[sheet.index];
    if (!entry) return null;
    return (
      <Sheet open title={`Ночь ${entry.night_number}: выстрел`} subtitle="В кого стреляла мафия и что вышло" onClose={close}>
        <div className="space-y-5 pb-2 pt-1">
          {api.locked ? <LockedNote /> : null}
          <section className="space-y-2" aria-label="Цель"><Eyebrow>Цель</Eyebrow>
            <SeatGrid label="Цель выстрела" size={api.tableSize} disabled={api.locked} selected={entry.target_seat ? [entry.target_seat] : []} onToggle={(seat) => api.changeShot(sheet.index, seat, entry.result)} tone="night" />
          </section>
          <section className="space-y-2" aria-label="Результат"><Eyebrow>Результат</Eyebrow>
            <Segmented label="Результат выстрела" disabled={api.locked} value={entry.result} options={SHOT_OPTIONS} cols={3} onChange={(value) => api.changeShot(sheet.index, entry.target_seat, value as 'killed' | 'miss' | 'agreement_failed')} />
          </section>
          <Btn kind="danger" block disabled={api.locked} onClick={() => { api.deleteNight(sheet.index); close(); }}>Удалить эту ночь</Btn>
        </div>
      </Sheet>
    );
  };

  const roundNo = circle.index + 1;
  const writeEvents = (updater: (list: LiveGameEvent[]) => LiveGameEvent[]) => api.setEvents(updater);
  const addEvent = (list: LiveGameEvent[], event: Partial<LiveGameEvent> & { kind: string }): LiveGameEvent[] => [...list, { seq: list.reduce((max, item) => Math.max(max, item.seq), 0) + 1, at: new Date().toISOString(), round: roundNo, phase: 'night', ...event } as LiveGameEvent];
  const setCheck = (kind: 'don' | 'sheriff', target: number | null, result: string | null) => writeEvents((list) => {
    const kept = list.filter((event) => !(event.round === roundNo && event.kind === `${kind}_check`));
    return target === null ? kept : addEvent(kept, { kind: `${kind}_check`, target, value: result });
  });

  const checkSheet = () => {
    if (!sheet || sheet.type !== 'check') return null;
    const kind = sheet.kind;
    const current = kind === 'don' ? checks.don : checks.sheriff;
    const holder = api.results.find((player) => player.role === kind) || null;
    const options = kind === 'don' ? [{ value: 'sheriff', label: 'Шериф' }, { value: 'not_sheriff', label: 'Не Шериф' }] : [{ value: 'red', label: 'Красный', tone: 'bad' as const }, { value: 'black', label: 'Чёрный', tone: 'night' as const }];
    const result = current?.result == null ? '' : kind === 'don' ? String(current.result) : /чёрн|черн|black/i.test(String(current.result)) ? 'black' : 'red';
    return (
      <Sheet open title={kind === 'don' ? 'Проверка Дона' : 'Проверка Шерифа'} subtitle={`${circleTitle(circle.index)} · ночь${holder ? ` · #${holder.seat_number} ${holder.display_name}` : ''}`} onClose={close} footer={<Btn kind="soft" big block onClick={close}>Готово</Btn>}>
        <div className="space-y-5 pb-2 pt-1">
          {api.locked ? <LockedNote /> : null}
          <section className="space-y-2" aria-label="Кого проверил"><Eyebrow>Кого проверил</Eyebrow>
            <SeatGrid label="Кого проверил" size={api.tableSize} disabled={api.locked} selected={current?.target ? [current.target] : []} hidden={holder ? [holder.seat_number] : []} tone="night" onToggle={(seat) => setCheck(kind, current?.target === seat ? null : seat, current?.target === seat ? null : (current?.result ?? (kind === 'don' ? 'not_sheriff' : 'red')) as string)} />
          </section>
          {current?.target ? (
            <section className="space-y-2" aria-label="Ответ"><Eyebrow>Ответ</Eyebrow>
              <Segmented label="Ответ проверки" disabled={api.locked} value={result} options={options} cols={2} onChange={(value) => setCheck(kind, current.target as number, value)} />
            </section>
          ) : <p className="text-[12px] text-white/45">Проверки не было. Выберите игрока, чтобы её записать.</p>}
        </div>
      </Sheet>
    );
  };

  const firstKilledSheet = () => {
    if (!sheet || sheet.type !== 'first-killed') return null;
    const move = (source: 'first_killed' | 'zero_round_voted') => bestMoveOf(source);
    const block = (title: string, source: 'first_killed' | 'zero_round_voted', current: typeof firstKilled, choose: (id: string | null) => void) => (
      <section className="space-y-2" aria-label={title}>
        <Eyebrow>{title}</Eyebrow>
        <div className="space-y-1.5">
          <button type="button" disabled={api.locked} aria-pressed={!current} onClick={() => choose(null)} className={cx('flex min-h-11 w-full items-center rounded-2xl px-3.5 text-left text-sm font-semibold', !current ? 'bg-white text-[#090a0d]' : 'bg-white/[0.06] text-white/70')}>Не выбран</button>
          {api.results.slice().sort((a, b) => a.seat_number - b.seat_number).map((player) => (
            <button key={player.participant_id} type="button" disabled={api.locked} aria-pressed={current?.participant_id === player.participant_id} onClick={() => choose(player.participant_id)} className={cx('flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left', current?.participant_id === player.participant_id ? 'bg-white text-[#090a0d]' : 'bg-white/[0.06] text-white/85')}>
              <SeatBadge seat={player.seat_number} team={teamOfRole(player.role)} size="sm" /><span className="flex-1 text-sm font-semibold">{player.display_name}</span><span className="text-[12px] opacity-60">{exitLabel(player.exit_type)}</span>
            </button>
          ))}
        </div>
        {current ? (
          <div className="space-y-1.5 pt-1"><div className="flex items-baseline justify-between"><span className="text-[13px] font-semibold">Лучший ход</span><span className="text-[12px] text-white/45">{move(source).length} из 3</span></div>
            <SeatGrid label="Лучший ход" size={api.tableSize} disabled={api.locked} selected={move(source)} onToggle={(seat) => api.toggleBestMoveSeat(source, current.participant_id, seat)} hidden={[current.seat_number]} tone="night" />
          </div>
        ) : null}
      </section>
    );
    return (
      <Sheet open title="Первый убитый и лучший ход" subtitle="Кто убит в первую ночь и кого он назвал" onClose={close}>
        <div className="space-y-6 pb-2 pt-1">
          {api.locked ? <LockedNote /> : null}
          {block('Первый убитый', 'first_killed', firstKilled, api.changeFirstKilled)}
          {circle.rootRounds.length || zeroVoted || api.zeroRoundRule === 'tournament' ? block('Заголосован в нулевом круге', 'zero_round_voted', zeroVoted, api.changeZeroRoundVoted) : null}
        </div>
      </Sheet>
    );
  };

  return (
    <div className="space-y-4">
      {api.locked ? <LockedNote /> : null}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0" role="tablist" aria-label="Круги игры">
        {circles.map((item) => {
          const on = item.index === circle.index;
          const flagged = issues.some((issue) => issue.circle === item.index);
          return (
            <button key={item.index} type="button" role="tab" aria-selected={on} onClick={() => onCircle(item.index)} className={cx('relative flex min-h-11 shrink-0 items-center gap-1.5 rounded-2xl px-4 text-[14px] font-semibold', on ? 'bg-white text-[#090a0d]' : 'bg-white/[0.06] text-white/70')}>
              {item.index === 0 ? 'Нулевой' : `Круг ${item.index}`}
              {reviewed[item.index] ? <Check className="h-4 w-4" aria-label="проверено" /> : null}
              {flagged && !on ? <span className="h-2 w-2 rounded-full bg-amber-300" aria-label="есть замечание" /> : null}
            </button>
          );
        })}
      </div>

      {circleIssues.length ? (
        <ul className="space-y-2">{circleIssues.map((issue) => <li key={issue.id} className={cx('rounded-2xl border px-3.5 py-2.5 text-[13px] leading-5', issue.severity === 'error' ? 'border-rose-300/20 bg-rose-300/[0.07] text-rose-50' : 'border-amber-300/20 bg-amber-300/[0.07] text-amber-50')}>{issue.title}{issue.sub ? <span className="block text-[12px] text-white/50">{issue.sub}</span> : null}</li>)}</ul>
      ) : null}

      {chains.map((chain) => (
        <div key={chain[0]} className="space-y-3">
          {chain.map((roundIndex, position) => renderVotingCard(roundIndex, position))}
        </div>
      ))}

      {circle.rootRounds.length === 0 ? <Card className="text-[13px] leading-5 text-white/55">В этом круге нет голосования. Если оно было, добавьте его.</Card> : null}
      <Btn kind="ghost" block disabled={api.locked} onClick={() => api.addVoting(circle.index)}><Plus className="h-4 w-4" aria-hidden="true" />Добавить голосование</Btn>

      {circle.index === 0 && circle.rootRounds.length ? (
        <Card tone="warn" className="space-y-2">
          <label htmlFor="zero-round-breaker" className="block text-sm font-semibold">Кто сломал попил в нуле?</label>
          <p className="text-[12px] leading-4 text-white/55">Только если ведущий точно зафиксировал, кто не поставил руку. По результату голосования это не определяется.</p>
          <select id="zero-round-breaker" aria-label="Сломал в нуле" disabled={api.locked} value={breaker ?? ''} onChange={(event) => api.setZeroBreakSeat(event.target.value ? Number(event.target.value) : null)} className="min-h-11 w-full rounded-xl border border-white/12 bg-[#111216] px-3 text-sm text-white">
            <option value="">Не отмечен</option>
            {api.results.slice().sort((a, b) => a.seat_number - b.seat_number).map((player) => <option key={player.participant_id} value={player.seat_number}>#{player.seat_number} {player.display_name}</option>)}
          </select>
        </Card>
      ) : null}

      <Card tone="night" className="space-y-2.5">
        <Eyebrow>{circle.index === 0 ? 'Первая ночь' : `Ночь после круга ${circle.index}`}</Eyebrow>
        {shot && shotText
          ? nightRow('Выстрел мафии', shotText, shot.result === 'killed' ? 'ok' : 'quiet', () => setSheet({ type: 'shot', index: circle.shotIndex }))
          : canAddNight ? <Btn kind="ghost" block disabled={api.locked} onClick={() => api.addNight()}><Plus className="h-4 w-4" aria-hidden="true" />Добавить ночь</Btn> : nightRow('Выстрел мафии', 'не записан', 'quiet')}
        {true ? (
          <>
            {nightRow('Проверка Дона', checks.don ? <span className="flex flex-wrap items-center gap-2"><span>#{checks.don.target} {nameOf(checks.don.target || 0)}</span><CheckAnswerTag kind="don" result={checks.don.result} /></span> : checks.donStep ? (donHere ? 'не отмечена' : 'Дон уже вышел') : 'не было', checks.don ? 'ok' : checks.donStep && circle.index >= 1 && donHere ? 'warn' : 'quiet', () => setSheet({ type: 'check', kind: 'don' }))}
            {nightRow('Проверка Шерифа', checks.sheriff ? <span className="flex flex-wrap items-center gap-2"><span>#{checks.sheriff.target} {nameOf(checks.sheriff.target || 0)}</span><CheckAnswerTag kind="sheriff" result={checks.sheriff.result} /></span> : checks.sheriffStep ? (sheriffHere ? 'не отмечена' : 'Шериф уже вышел') : 'не было', checks.sheriff ? 'ok' : checks.sheriffStep && circle.index >= 1 && sheriffHere ? 'warn' : 'quiet', () => setSheet({ type: 'check', kind: 'sheriff' }))}
          </>
        ) : null}
        {circle.index === 0 ? nightRow('Первый убитый и лучший ход', firstKilled ? <span className="flex flex-wrap items-center gap-2"><span>#{firstKilled.seat_number} {firstKilled.display_name}</span><FirstKilledTag />{bestMoveOf('first_killed').length ? <BestMoveTag /> : <InfoTag tone="attention">Ход не указан</InfoTag>}{bestMoveOf('first_killed').length ? <span className="text-[13px] text-white/60">{bestMoveOf('first_killed').map((seat) => `#${seat}`).join(' ')}</span> : null}</span> : 'не выбран', firstKilled ? 'ok' : 'quiet', () => setSheet({ type: 'first-killed' })) : null}
      </Card>

      {exits.length || fouls.length ? (
        <Card className="space-y-3">
          {exits.length ? (
            <div><Eyebrow>Вышли в этом круге</Eyebrow>
              <ul className="mt-2 flex flex-wrap gap-2">{exits.map((item) => <li key={item.seat} className="flex items-center gap-2 rounded-2xl bg-black/25 py-1.5 pl-1.5 pr-3 text-[13px]"><SeatBadge seat={item.seat} team={teamOf(item.seat)} size="sm" dim /><span className="flex flex-wrap items-center gap-1.5"><span className="font-semibold">{nameOf(item.seat)}</span>{['killed', 'voted_day', 'voted_zero_round', 'removed'].includes(item.reason) ? <ExitTag exit={item.reason} /> : <InfoTag>Вышел</InfoTag>}</span></li>)}</ul>
            </div>
          ) : null}
          {fouls.length ? (
            <div><Eyebrow>Нарушения</Eyebrow>
              <ul className="mt-2 flex flex-wrap gap-1.5">{fouls.map((item) => <li key={`${item.seat}-${item.text}`}><InfoTag tone="attention">#{item.seat} {item.text}</InfoTag></li>)}</ul>
            </div>
          ) : null}
        </Card>
      ) : null}

      <Btn kind={reviewed[circle.index] ? 'soft' : 'primary'} big block onClick={() => onToggleReviewed(circle.index)}>
        {reviewed[circle.index] ? <><Check className="h-5 w-5" aria-hidden="true" />Круг проверен — снять отметку</> : 'Отметить круг проверенным'}
      </Btn>

      {ballotSheet()}
      {roundSheet()}
      {shotSheet()}
      {firstKilledSheet()}
      {checkSheet()}
    </div>
  );
};
