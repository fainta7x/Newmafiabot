import type { PlayerResultData, ShotEntry, TournamentGameProtocolData } from './api';
import { hasPerDayRoundNumbers, renumberVotingRoundsSequentially } from '../shared/votingRoundNumbers.ts';

/**
 * Club games saved by older builds hold facts that the shared protocol checks (owner decision 3, 2026-10-23) now refuse,
 * so such a game could not be saved or completed again after any correction. Two of them are not a matter of opinion but
 * follow from the game's own record, so they are put right before the checks run:
 *
 * - a night result stored as «промах» although the player it was aimed at left the game as killed (the old recorder read
 *   «already dead before the morning» as a miss, so every killed target of games saved before 2026-10-17 is a «промах»);
 * - voting rounds that still carry the engine's per-day numbers, so two rounds on different days share a number.
 *
 * Nothing else is touched, and nothing is guessed: a night whose target cannot be matched to a killed player stays as
 * it is and the check reports it.
 */
export type LegacyProtocolRepair =
  | { kind: 'shot_result'; night: number; seat: number; from: ShotEntry['result']; to: 'killed' }
  | { kind: 'round_numbers' };

export const repairLegacyClubProtocol = (
  protocol: TournamentGameProtocolData,
  playerResults: ReadonlyArray<Pick<PlayerResultData, 'seat_number' | 'exit_type'>>,
): { protocol: TournamentGameProtocolData; repairs: LegacyProtocolRepair[] } => {
  const repairs: LegacyProtocolRepair[] = [];
  let next = protocol;

  const killedSeats = new Set(playerResults.filter((player) => player.exit_type === 'killed').map((player) => Number(player.seat_number)));
  const shots = Array.isArray(protocol.shots) ? protocol.shots : [];
  const alreadyKilled = new Set(shots.filter((shot) => shot?.result === 'killed' && Number(shot.target_seat) > 0).map((shot) => Number(shot.target_seat)));
  const repairedShots = shots.map((shot) => {
    const seat = Number(shot?.target_seat);
    if (shot?.result !== 'miss' || !(seat > 0) || !killedSeats.has(seat) || alreadyKilled.has(seat)) return shot;
    alreadyKilled.add(seat);
    repairs.push({ kind: 'shot_result', night: Number(shot.night_number), seat, from: shot.result, to: 'killed' });
    return { ...shot, result: 'killed' as const };
  });
  if (repairs.length) next = { ...next, shots: repairedShots };

  const votes = Array.isArray(protocol.votes) ? protocol.votes : [];
  if (votes.length > 1 && hasPerDayRoundNumbers(votes)) {
    next = { ...next, votes: renumberVotingRoundsSequentially(votes as any) as any };
    repairs.push({ kind: 'round_numbers' });
  }

  return { protocol: next, repairs };
};

export const describeLegacyRepair = (repair: LegacyProtocolRepair): string => repair.kind === 'shot_result'
  ? `ночь ${repair.night}: игрок #${repair.seat} убит (в записи было «промах»)`
  : 'номера кругов голосования сделаны сквозными';

/** The same, for the screen: all the nights in one phrase. */
export const describeLegacyRepairs = (repairs: LegacyProtocolRepair[]): string[] => {
  const shots = repairs.filter((repair): repair is Extract<LegacyProtocolRepair, { kind: 'shot_result' }> => repair.kind === 'shot_result');
  const lines = shots.length > 1
    ? [`ночи ${shots.map((repair) => repair.night).join(', ')}: убитые игроки (${shots.map((repair) => `#${repair.seat}`).join(', ')}) были записаны как «промах»`]
    : shots.map(describeLegacyRepair);
  if (repairs.some((repair) => repair.kind === 'round_numbers')) lines.push('номера кругов голосования сделаны сквозными');
  return lines;
};
