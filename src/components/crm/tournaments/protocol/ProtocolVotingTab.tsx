import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { TournamentGameProtocolData, PlayerResultData } from '../../../../lib/api';
import { VotingRound, determineVotingResult } from '../../../../shared/tournamentVoting';

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
        className={`rounded-xl border transition-all ${isNested ? 'bg-slate-900/40 p-3.5 space-y-3 border-purple-500/20' : 'bg-slate-800/60 p-4 space-y-4'} ${
          isErrorHighlighted
            ? 'border-rose-500/80 ring-2 ring-rose-500/20 bg-rose-950/10'
            : isNested ? 'border-purple-500/20' : 'border-slate-700/80'
        }`}
      >
        {/* Round Header */}
        {isNested ? (
          <div className="flex items-center justify-between border-b border-slate-700/60 pb-2">
            <span className="font-bold text-xs text-purple-400">
              Переголосование (Круг #{roundNum})
            </span>
            {protocol.status === 'draft' && (
              <button
                type="button"
                onClick={() => {
                  onDeleteVoting(rIdx);
                }}
                className="text-slate-500 hover:text-rose-400 p-1"
                title="Удалить переголосование"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-bold text-sm text-amber-400">
                Круг #{roundNum}
              </span>

              {/* Day Badge/Selector */}
              <div className="flex items-center space-x-1.5 text-xs bg-slate-900 px-2 py-1 rounded-lg border border-slate-700">
                <span className="text-slate-400 text-[11px]">День:</span>
                <select
                  disabled={protocol.status === 'completed' || isConfirmed || round.is_revote}
                  value={dayNum}
                  onChange={(e) => {
                    const d = parseInt(e.target.value) || 0;
                    onRoundChange(rIdx, (r) => ({
                      ...r,
                      day_number: d,
                      eligible_voters: d === 0 ? 10 : r.eligible_voters
                    }));
                  }}
                  className="bg-transparent text-amber-400 font-bold focus:outline-none text-[11px]"
                >
                  <option value="0" className="bg-slate-900 text-slate-200">0 (Нулевой)</option>
                  <option value="1" className="bg-slate-900 text-slate-200">1</option>
                  <option value="2" className="bg-slate-900 text-slate-200">2</option>
                  <option value="3" className="bg-slate-900 text-slate-200">3</option>
                  <option value="4" className="bg-slate-900 text-slate-200">4</option>
                  <option value="5" className="bg-slate-900 text-slate-200">5</option>
                  <option value="6" className="bg-slate-900 text-slate-200">6</option>
                </select>
              </div>

              {/* Eligible Voters Selector */}
              <div className="flex items-center space-x-1.5 text-xs bg-slate-900 px-2 py-1 rounded-lg border border-slate-700">
                <span className="text-slate-400 text-[11px]">Голосующих:</span>
                <select
                  disabled={protocol.status === 'completed' || isConfirmed || round.is_revote || dayNum === 0}
                  value={eligibleVoters}
                  onChange={(e) => {
                    const ev = parseInt(e.target.value) || 10;
                    onRoundChange(rIdx, (r) => ({ ...r, eligible_voters: ev }));
                  }}
                  className="bg-transparent text-amber-400 font-bold focus:outline-none text-[11px]"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <option key={n} value={n} className="bg-slate-900 text-slate-200">
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
                className="text-slate-500 hover:text-rose-400 p-1"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Candidate Seats Selector */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Выставленные кандидаты (выберите от 1 до 10 игроков):</span>
            {round.is_revote && round.parent_round_number && (
              <span className="text-purple-400 font-medium text-[11px]">
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
                    onRoundChange(rIdx, (r) => {
                      const currentNoms = r.nominated_seats || [];
                      let updatedNoms: number[];
                      let updatedCounts = { ...(r.vote_counts || {}) };

                      if (currentNoms.includes(seatNum)) {
                        updatedNoms = currentNoms.filter((s: number) => s !== seatNum);
                        delete updatedCounts[seatNum];
                      } else {
                        updatedNoms = Array.from(new Set([...currentNoms, seatNum]));
                        updatedCounts[seatNum] = updatedCounts[seatNum] || 0;
                      }

                      return {
                        ...r,
                        nominated_seats: updatedNoms,
                        vote_counts: updatedCounts
                      };
                    });
                  }}
                  className={`w-full h-11 sm:w-8 sm:h-8 rounded-lg text-sm font-bold border transition ${
                    isNominated
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                      : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800 hover:text-slate-200'
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
          <div className="space-y-1.5 pt-3 border-t border-slate-700/60">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Распределение голосов:</span>
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
                    className="bg-slate-900 p-2 rounded-lg border border-slate-700/80 text-xs flex flex-col space-y-1"
                  >
                    <div className="flex items-center justify-between font-semibold text-slate-200 text-[11px] truncate">
                      <span className="truncate">#{seatNum} {p?.display_name || ''}</span>
                      {protocol.status === 'draft' && !isConfirmed && (
                        <div className="flex items-center space-x-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              onRoundChange(rIdx, (r) => {
                                const noms = [...(r.nominated_seats || [])];
                                const idx = noms.indexOf(seatNum);
                                if (idx > 0) {
                                  const temp = noms[idx];
                                  noms[idx] = noms[idx - 1];
                                  noms[idx - 1] = temp;
                                }
                                return { ...r, nominated_seats: noms };
                              });
                            }}
                            className="text-slate-400 hover:text-amber-400 p-0.5 text-[11px] leading-none"
                            title="Сдвинуть раньше"
                          >
                            ←
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onRoundChange(rIdx, (r) => {
                                const noms = [...(r.nominated_seats || [])];
                                const idx = noms.indexOf(seatNum);
                                if (idx >= 0 && idx < noms.length - 1) {
                                  const temp = noms[idx];
                                  noms[idx] = noms[idx + 1];
                                  noms[idx + 1] = temp;
                                }
                                return { ...r, nominated_seats: noms };
                              });
                            }}
                            className="text-slate-400 hover:text-amber-400 p-0.5 text-[11px] leading-none"
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
                        const raw = e.target.value.replace(/\D/g, '');
                        if (raw === '') {
                          setVoteDrafts(prev => ({ ...prev, [draftKey]: '' }));
                          onRoundChange(rIdx, (r) => ({
                            ...r,
                            vote_counts: {
                              ...(r.vote_counts || {}),
                              [seatNum]: 0
                            }
                          }));
                        } else {
                          let val = parseInt(raw, 10);
                          if (val > eligibleVoters) val = eligibleVoters;
                          const cleanStr = String(val);
                          setVoteDrafts(prev => ({ ...prev, [draftKey]: cleanStr }));
                          onRoundChange(rIdx, (r) => ({
                            ...r,
                            vote_counts: {
                              ...(r.vote_counts || {}),
                              [seatNum]: val
                            }
                          }));
                        }
                      }}
                      onBlur={() => {
                        setVoteDrafts(prev => {
                          const copy = { ...prev };
                          delete copy[draftKey];
                          return copy;
                        });
                      }}
                      className={`w-full h-11 bg-slate-800 border border-slate-700 rounded px-2 text-center font-bold text-lg text-amber-400 focus:border-amber-500 focus:outline-none ${isReadOnlyCandidate ? 'opacity-70 cursor-not-allowed bg-slate-900/60' : ''}`}
                    />
                    {isReadOnlyCandidate && (
                      <span className="text-[9px] text-slate-500 text-center font-semibold uppercase tracking-wider mt-0.5">
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
          <div className="space-y-1.5 pt-3 border-t border-slate-700/60">
            <div className="flex flex-col space-y-1">
              <span className="text-xs text-slate-400">Голоса за уход всех спорных игроков (#{winners.join(', #')}):</span>
              <div className="flex items-center space-x-3 bg-slate-900 p-2 rounded-lg border border-slate-700 max-w-xs">
                <input
                  type="text"
                  inputMode="numeric"
                  disabled={protocol.status === 'completed' || isConfirmed}
                  value={voteDrafts[`${rIdx}-leave`] !== undefined ? voteDrafts[`${rIdx}-leave`] : (round.table_leave_votes !== null && round.table_leave_votes !== undefined ? String(round.table_leave_votes) : '')}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, '');
                    if (raw === '') {
                      setVoteDrafts(prev => ({ ...prev, [`${rIdx}-leave`]: '' }));
                      onRoundChange(rIdx, (r) => ({
                        ...r,
                        table_leave_votes: null
                      }));
                    } else {
                      let val = parseInt(raw, 10);
                      if (val > eligibleVoters) val = eligibleVoters;
                      const cleanStr = String(val);
                      setVoteDrafts(prev => ({ ...prev, [`${rIdx}-leave`]: cleanStr }));
                      onRoundChange(rIdx, (r) => ({
                        ...r,
                        table_leave_votes: val
                      }));
                    }
                  }}
                  onBlur={() => {
                    setVoteDrafts(prev => {
                      const copy = { ...prev };
                      delete copy[`${rIdx}-leave`];
                      return copy;
                    });
                  }}
                  className="w-16 h-10 bg-slate-800 border border-slate-700 rounded text-center font-bold text-md text-amber-400 focus:border-amber-500 focus:outline-none"
                />
                <span className="text-xs text-slate-400">
                  Большинство для ухода: <strong className="text-amber-400">{Math.floor(eligibleVoters / 2) + 1}</strong>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Outcome Calculator & Judge Confirmation Panel */}
        {nominatedSeats.length > 0 && (
          <div className="pt-3 border-t border-slate-700/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Статус исхода (рассчитано автоматически)
              </span>
              <div className="text-xs text-slate-300">
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
                  className="w-full sm:w-auto px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:border-slate-700/50 text-white font-bold text-xs transition border border-emerald-500 shadow"
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
                      className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-rose-400 hover:text-rose-300 border border-rose-500/30 text-xs font-medium transition"
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
              <div className="mt-4 pt-4 border-t-2 border-dashed border-purple-500/30 space-y-3">
                <div className="text-xs font-bold uppercase text-purple-400 tracking-wider flex items-center space-x-1">
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
        <span className="text-xs text-slate-400">
          Протокол дневных голосов и переголосований по кругам:
        </span>
        {protocol.status === 'draft' && (
          <button
            type="button"
            onClick={onAddVoting}
            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center space-x-1"
          >
            <Plus className="w-4 h-4" />
            <span>Добавить голосование</span>
          </button>
        )}
      </div>

      {!protocol.votes || protocol.votes.length === 0 ? (
        <div className="bg-slate-800/40 rounded-xl p-8 text-center text-slate-400 text-xs border border-slate-800">
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
