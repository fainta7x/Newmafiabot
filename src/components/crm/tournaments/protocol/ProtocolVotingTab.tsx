import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { TournamentGameProtocolData, PlayerResultData } from '../../../../lib/api';
import { VotingRound, determineVotingResult } from '../../../../shared/tournamentVoting';
import {
  moveNominatedSeat,
  parseOptionalVoteInput,
  parseVoteCountInput,
  setTableLeaveVotes,
  setVotingSeatCount,
  toggleNominatedSeat,
  updateEligibleVoters,
  updateVotingDay
} from './protocolVotingEditorUtils';

export interface ProtocolVotingTabProps {
  protocol: TournamentGameProtocolData;
  playerResults: PlayerResultData[];
  voteDrafts: Record<string, string>;
  setVoteDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  highlightedRoundIdx: number | null;
  onAddVoting: () => void;
  onDeleteVoting: (rIdx: number) => void;
  onRoundChange: (rIdx: number, updater: (r: any) => any) => void;
  onConfirmOutcome: (rIdx: number, calculatedOutcome: string, winners: number[]) => void;
  onResetOutcome: (rIdx: number) => void;
  onRegisterRoundRef?: (rIdx: number, el: HTMLDivElement | null) => void;
}

export const ProtocolVotingTab: React.FC<ProtocolVotingTabProps> = ({
  protocol,
  playerResults,
  voteDrafts,
  setVoteDrafts,
  highlightedRoundIdx,
  onAddVoting,
  onDeleteVoting,
  onRoundChange,
  onConfirmOutcome,
  onResetOutcome,
  onRegisterRoundRef
}) => {

  const renderRoundCard = (round: VotingRound, rIdx: number, isNested = false) => {
    const roundNum = round.round_number || rIdx + 1;
    const dayNum = round.day_number ?? (rIdx === 0 ? 0 : 1);
    const eligibleVoters = round.eligible_voters ?? 10;
    const nominatedSeats = round.nominated_seats || [];
    const voteCounts = round.vote_counts || {};
    const sumVotes = nominatedSeats.reduce((sum: number, s: number) => sum + (voteCounts[s] || 0), 0);
    const isConfirmed = round.outcome && round.outcome !== 'pending';

    const votingResult = determineVotingResult(round);
    const winners = votingResult.winners;
    const calculatedOutcome = votingResult.resolvedOutcome || (votingResult.outcome === 'requires_table_decision' ? 'pending' : votingResult.outcome);
    const outcomeDescription = votingResult.outcome === 'requires_table_decision' && votingResult.resolvedOutcome === undefined
      ? 'Введите количество голосов за уход всех игроков для подведения итогов переголосования'
      : votingResult.description;

    const isErrorHighlighted = highlightedRoundIdx === rIdx;

    return (
      <div
        key={rIdx}
        ref={(el) => {
          if (onRegisterRoundRef) {
            onRegisterRoundRef(rIdx, el);
          }
        }}
        data-testid={`round-card-${rIdx}`}
        className={`protocol-vote-stage space-y-4 ${isNested ? 'protocol-vote-stage--nested' : ''} ${isErrorHighlighted ? 'protocol-vote-stage--error' : ''}`}
      >
        {/* Round Header */}
        {isNested ? (
          <div className="flex items-center justify-between border-b border-border-soft/60 pb-2">
            <span className="font-bold text-xs text-accent">
              Переголосование (Круг #{roundNum})
            </span>
            {protocol.status === 'draft' && (
              <button
                type="button"
                onClick={() => {
                  onDeleteVoting(rIdx);
                }}
                className="text-text-muted hover:text-rose-400 p-1"
                title="Удалить переголосование"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between border-b border-border-soft/60 pb-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-bold text-sm text-amber-400">
                Круг #{roundNum}
              </span>

              {/* Day Badge/Selector */}
              <div className="flex items-center space-x-1.5 text-xs bg-surface-1 px-2 py-1 rounded-lg border border-border-soft">
                <span className="text-text-secondary text-[11px]">День:</span>
                <select
                  disabled={protocol.status === 'completed' || isConfirmed || round.is_revote}
                  value={dayNum}
                  onChange={(e) => {
                    onRoundChange(rIdx, (r) =>
                      updateVotingDay(r, e.target.value)
                    );
                  }}
                  className="bg-transparent text-amber-400 font-bold focus:outline-none text-[11px]"
                >
                  <option value="0" className="bg-surface-1 text-text-primary">0 (Нулевой)</option>
                  <option value="1" className="bg-surface-1 text-text-primary">1</option>
                  <option value="2" className="bg-surface-1 text-text-primary">2</option>
                  <option value="3" className="bg-surface-1 text-text-primary">3</option>
                  <option value="4" className="bg-surface-1 text-text-primary">4</option>
                  <option value="5" className="bg-surface-1 text-text-primary">5</option>
                  <option value="6" className="bg-surface-1 text-text-primary">6</option>
                </select>
              </div>

              {/* Eligible Voters Selector */}
              <div className="flex items-center space-x-1.5 text-xs bg-surface-1 px-2 py-1 rounded-lg border border-border-soft">
                <span className="text-text-secondary text-[11px]">Голосующих:</span>
                <select
                  disabled={protocol.status === 'completed' || isConfirmed || round.is_revote || dayNum === 0}
                  value={eligibleVoters}
                  onChange={(e) => {
                    onRoundChange(rIdx, (r) =>
                      updateEligibleVoters(r, e.target.value)
                    );
                  }}
                  className="bg-transparent text-amber-400 font-bold focus:outline-none text-[11px]"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <option key={n} value={n} className="bg-surface-1 text-text-primary">
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {protocol.status === 'draft' && (
              <button
                type="button"
                onClick={() => {
                  onDeleteVoting(rIdx);
                }}
                className="text-text-muted hover:text-rose-400 p-1"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Candidate Seats Selector */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>Выставленные кандидаты (выберите от 1 до 10 игроков):</span>
            {round.is_revote && round.parent_round_number && (
              <span className="text-accent font-medium text-[11px]">
                (Кандидаты привязаны к ничьей в Круге #{round.parent_round_number})
              </span>
            )}
          </div>
          <div className="grid grid-cols-5 sm:flex sm:flex-wrap gap-1.5 w-full">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((seatNum) => {
              const isNominated = nominatedSeats.includes(seatNum);
              return (
                <button
                  key={seatNum}
                  type="button"
                  disabled={protocol.status === 'completed' || isConfirmed || (round.is_revote && !!round.parent_round_number)}
                  onClick={() => {
                    onRoundChange(rIdx, (r) =>
                      toggleNominatedSeat(r, seatNum)
                    );
                  }}
                  className={`protocol-seat-button w-full sm:w-9 text-sm font-bold transition ${
                    isNominated
                      ? 'bg-accent text-white border-accent'
                      : 'bg-surface-1 text-text-secondary border-border-soft hover:bg-surface-hover hover:text-text-primary'
                  }`}
                >
                  #{seatNum}
                </button>
              );
            })}
          </div>
        </div>

        {/* Vote Counts per Candidate */}
        {nominatedSeats.length > 0 && (
          <div className="space-y-1.5 pt-3 border-t border-border-soft/60">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-secondary">Распределение голосов:</span>
              <span className={`font-bold ${sumVotes === eligibleVoters ? 'text-emerald-400' : 'text-amber-400'}`}>
                Всего распределено: {sumVotes} из {eligibleVoters}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {nominatedSeats.map((seatNum: number) => {
                const p = playerResults.find((pr) => pr.seat_number === seatNum);
                const count = voteCounts[seatNum] ?? 0;
                const draftKey = `${rIdx}-${seatNum}`;
                const draftValue = voteDrafts[draftKey] !== undefined ? voteDrafts[draftKey] : String(count);
                const isReadOnlyCandidate = nominatedSeats.length === 1 || (nominatedSeats.length >= 2 && nominatedSeats[nominatedSeats.length - 1] === seatNum);

                return (
                  <div
                    key={seatNum}
                    className="bg-surface-1 p-2 rounded-lg border border-border-soft/80 text-xs flex flex-col space-y-1"
                  >
                    <div className="flex items-center justify-between font-semibold text-text-primary text-[11px] truncate">
                      <span className="truncate">#{seatNum} {p?.display_name || ''}</span>
                      {protocol.status === 'draft' && !isConfirmed && (
                        <div className="flex items-center space-x-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              onRoundChange(rIdx, (r) =>
                                moveNominatedSeat(r, seatNum, 'earlier')
                              );
                            }}
                            className="text-text-secondary hover:text-amber-400 p-0.5 text-[11px] leading-none"
                            title="Сдвинуть раньше"
                          >
                            ←
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onRoundChange(rIdx, (r) =>
                                moveNominatedSeat(r, seatNum, 'later')
                              );
                            }}
                            className="text-text-secondary hover:text-amber-400 p-0.5 text-[11px] leading-none"
                            title="Сдвинуть позже"
                          >
                            →
                          </button>
                        </div>
                      )}
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      disabled={protocol.status === 'completed' || isConfirmed || isReadOnlyCandidate}
                      value={isReadOnlyCandidate ? String(count) : draftValue}
                      placeholder={isReadOnlyCandidate ? (nominatedSeats.length === 1 ? "все голоса" : "остаток") : ""}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        if (isReadOnlyCandidate) return;
                        const parsed = parseVoteCountInput(
                          e.target.value,
                          eligibleVoters
                        );
                        setVoteDrafts(prev => ({
                          ...prev,
                          [draftKey]: parsed.draftValue
                        }));
                        onRoundChange(rIdx, (r) =>
                          setVotingSeatCount(r, seatNum, parsed.value)
                        );
                      }}
                      onBlur={() => {
                        setVoteDrafts(prev => {
                          const copy = { ...prev };
                          delete copy[draftKey];
                          return copy;
                        });
                      }}
                      className={`w-full h-11 bg-surface-2 border border-border-soft rounded px-2 text-center font-bold text-lg text-amber-400 focus:border-accent focus:outline-none ${isReadOnlyCandidate ? 'opacity-70 cursor-not-allowed bg-surface-1/60' : ''}`}
                    />
                    {isReadOnlyCandidate && (
                      <span className="text-[9px] text-text-muted text-center font-semibold uppercase tracking-wider mt-0.5">
                        {nominatedSeats.length === 1 ? "все голоса" : "остаток"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Revote: Table leave votes block */}
        {votingResult.outcome === 'requires_table_decision' && nominatedSeats.length > 0 && (
          <div className="space-y-1.5 pt-3 border-t border-border-soft/60">
            <div className="flex flex-col space-y-1">
              <span className="text-xs text-text-secondary">Голоса за уход всех спорных игроков (#{winners.join(', #')}):</span>
              <div className="flex items-center space-x-3 bg-surface-1 p-2 rounded-lg border border-border-soft max-w-xs">
                <input
                  type="text"
                  inputMode="numeric"
                  disabled={protocol.status === 'completed' || isConfirmed}
                  value={voteDrafts[`${rIdx}-leave`] !== undefined ? voteDrafts[`${rIdx}-leave`] : (round.table_leave_votes !== null && round.table_leave_votes !== undefined ? String(round.table_leave_votes) : '')}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const parsed = parseOptionalVoteInput(
                      e.target.value,
                      eligibleVoters
                    );
                    setVoteDrafts(prev => ({
                      ...prev,
                      [`${rIdx}-leave`]: parsed.draftValue
                    }));
                    onRoundChange(rIdx, (r) =>
                      setTableLeaveVotes(r, parsed.value)
                    );
                  }}
                  onBlur={() => {
                    setVoteDrafts(prev => {
                      const copy = { ...prev };
                      delete copy[`${rIdx}-leave`];
                      return copy;
                    });
                  }}
                  className="protocol-noir-field !w-20 text-center font-bold text-md text-warning tabular-nums"
                />
                <span className="text-xs text-text-secondary">
                  Большинство для ухода: <strong className="text-amber-400">{Math.floor(eligibleVoters / 2) + 1}</strong>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Outcome Calculator & Judge Confirmation Panel */}
        {nominatedSeats.length > 0 && (
          <div className="pt-3 border-t border-border-soft/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider block">
                Статус исхода (рассчитано автоматически)
              </span>
              <div className="text-xs text-text-secondary">
                {sumVotes !== eligibleVoters ? (
                  <span className="text-amber-400/80 italic font-medium">
                    Распределите {eligibleVoters} голосов для подведения итогов
                  </span>
                ) : (
                  <span className="font-semibold text-amber-100">
                    {outcomeDescription}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              {!isConfirmed ? (
                <button
                  type="button"
                  disabled={sumVotes !== eligibleVoters || calculatedOutcome === 'pending' || protocol.status === 'completed'}
                  onClick={() => {
                    if (calculatedOutcome !== 'pending') {
                      onConfirmOutcome(rIdx, calculatedOutcome, winners);
                    }
                  }}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-surface-2 disabled:text-text-muted disabled:border-border-soft/50 text-white font-bold text-xs transition border border-emerald-500 shadow"
                >
                  Подтвердить исход
                </button>
              ) : (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                  <span className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold text-center">
                    ✓ Подтверждено
                  </span>
                  {protocol.status === 'draft' && (
                    <button
                      type="button"
                      onClick={() => onResetOutcome(rIdx)}
                      className="px-3 py-1.5 rounded-lg bg-surface-1 hover:bg-surface-2 text-rose-400 hover:text-rose-300 border border-rose-500/30 text-xs font-medium transition"
                    >
                      Сбросить
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        {(() => {
          const childRIdx = (protocol.votes || []).findIndex((r: VotingRound) => r.is_revote && r.parent_round_number === round.round_number);
          if (childRIdx >= 0) {
            const childRound = protocol.votes[childRIdx];
            return (
              <div className="mt-4 pt-4 border-t-2 border-dashed border-accent/30 space-y-3">
                <div className="text-xs font-bold uppercase text-accent tracking-wider flex items-center space-x-1">
                  <span>Переголосование по кругу #{roundNum}</span>
                </div>
                {renderRoundCard(childRound, childRIdx, true)}
              </div>
            );
          }
          return null;
        })()}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-secondary">
          Протокол дневных голосов и переголосований по кругам:
        </span>
        {protocol.status === 'draft' && (
          <button
            type="button"
            onClick={onAddVoting}
            className="protocol-action-primary px-3 py-1.5 text-xs flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            <span>Добавить голосование</span>
          </button>
        )}
      </div>

      {!protocol.votes || protocol.votes.length === 0 ? (
        <div className="protocol-noir-section text-center text-text-secondary text-xs py-8">
          Голосования не зафиксированы. Нажмите «Добавить голосование» для внесения данных.
        </div>
      ) : (
        <div className="space-y-4">
          {protocol.votes.map((round, rIdx) => {
            if (round.is_revote) return null;

            return renderRoundCard(round, rIdx, false);
          })}
        </div>
      )}
    </div>
  );
};
