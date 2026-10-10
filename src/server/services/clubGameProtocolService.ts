import { sanitizeLiveGameEvents } from '../../shared/liveGameEvents.ts';
import { calculateDisciplinaryPenalty } from '../../lib/gameDiscipline.ts';
import { blackParticipantIds, withoutBlackBestMoves, withoutBlackLegacyBestMove } from './blackBestMoves.ts';
import { isSupportedTableSize, roleCountsMatchTable, tableRolesLabel } from '../../lib/tableComposition.ts';

const ROLE_ORDER = ['citizen', 'sheriff', 'mafia', 'don'] as const;
type CanonicalRole = typeof ROLE_ORDER[number];

const canonicalRole = (value: unknown): CanonicalRole | null => {
  const role = String(value || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  if (['citizen', 'мирный', 'мирный житель'].includes(role)) return 'citizen';
  if (['sheriff', 'шериф'].includes(role)) return 'sheriff';
  if (['mafia', 'мафия', 'маф'].includes(role)) return 'mafia';
  if (['don', 'дон'].includes(role)) return 'don';
  return null;
};

const teamFromRole = (role: CanonicalRole | null): 'red' | 'black' | null => {
  if (role === 'citizen' || role === 'sheriff') return 'red';
  if (role === 'mafia' || role === 'don') return 'black';
  return null;
};

const finite = (value: unknown, label: string): number => {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) throw new Error(`${label}: нужно указать корректное число`);
  return number;
};

const integerInRange = (value: unknown, min: number, max: number, label: string): number => {
  const number = finite(value, label);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(`${label}: допустимо от ${min} до ${max}`);
  return number;
};

const tenthInRange = (value: unknown, min: number, max: number, label: string): number => {
  // Sign-symmetric: +0.05 and -0.05 round away from zero alike (Math.round alone sends -0.05 to 0 but +0.05 to 0.1).
  const raw = finite(value, label);
  const number = Math.sign(raw) * Math.round(Math.abs(raw) * 10) / 10;
  if (number < min || number > max) throw new Error(`${label}: допустимо от ${min} до ${max}`);
  return number;
};

const validExitTypes = new Set(['alive', 'killed', 'voted_zero_round', 'voted_day', 'removed']);
const validRemovalReasons = new Set(['4th_foul', '2nd_tech', 'direct']);

const referencedParticipant = (participantIds: Set<string>, value: unknown, label: string): string | null => {
  const id = String(value || '').trim();
  if (!id) return null;
  if (!participantIds.has(id)) throw new Error(`${label}: выбран игрок не из этой партии`);
  return id;
};

const validateBestMoves = (protocol: any, participantIds: Set<string>, tableSize: number) => {
  const moves = Array.isArray(protocol?.best_moves) ? protocol.best_moves : [];
  for (const move of moves) {
    const participantId = referencedParticipant(participantIds, move?.participant_id, 'Лучший ход');
    if (!participantId) throw new Error('Лучший ход: не указан игрок');
    if (!['first_killed', 'zero_round_voted'].includes(String(move?.source || ''))) throw new Error('Лучший ход: некорректный источник');
    const seats: number[] = Array.isArray(move?.seat_numbers) ? move.seat_numbers.map(Number) : [];
    if (seats.length > 3 || new Set(seats).size !== seats.length || seats.some((seat) => !Number.isInteger(seat) || seat < 1 || seat > tableSize)) throw new Error(`Лучший ход: можно указать до 3 уникальных мест от 1 до ${tableSize}`);
  }
};


const normalizeCi = (value: number, eligible: boolean, ceiling: number): number => {
  if (!eligible) return 0;
  return Math.round(Math.min(ceiling, Math.max(0, value)) * 100) / 100;
};

export interface CanonicalClubGameSave { protocol: any; playerResults: any[]; }

export const canonicalizeClubGameSave = (
  previousPayload: any,
  incomingProtocol: any,
  incomingResults: any[],
  status: 'draft' | 'completed',
): CanonicalClubGameSave => {
  const previousResults = Array.isArray(previousPayload?.player_results) ? previousPayload.player_results : [];
  // The table size is fixed when the game is created (10, or 8–9 on a novice evening).
  const tableSize = previousResults.length;
  if (!isSupportedTableSize(tableSize)) throw new Error('У исходной игры повреждён состав: ожидается от 8 до 10 игроков');
  if (!Array.isArray(incomingResults) || incomingResults.length !== tableSize) throw new Error(`Для игры нужны результаты ровно ${tableSize} игроков`);

  const previousByParticipant = new Map<string, any>(previousResults.map((result: any) => [String(result.participant_id || ''), result]));
  const incomingIds = incomingResults.map((result: any) => String(result?.participant_id || '').trim());
  if (incomingIds.some((id) => !id) || new Set(incomingIds).size !== tableSize) throw new Error(`В протоколе должны быть ${tableSize} уникальных участников`);
  if (incomingIds.some((id) => !previousByParticipant.has(id))) throw new Error('Нельзя заменить состав уже созданной игры через протокол');

  const firstKilledParticipantId = String(incomingProtocol?.first_killed_participant_id || '').trim() || null;
  const ppkCulpritId = String(incomingProtocol?.ppk_culprit_participant_id || '').trim() || null;
  const participantIds = new Set(incomingIds);
  if (ppkCulpritId && !participantIds.has(ppkCulpritId)) throw new Error('Виновник ППК не относится к этой игре');

  const playerResults = incomingResults.map((incoming: any) => {
    const participantId = String(incoming.participant_id);
    const previous = previousByParticipant.get(participantId);
    const seat = Number(previous?.seat_number);
    if (Number(incoming.seat_number) !== seat) throw new Error(`Нельзя изменить место игрока #${seat} через протокол`);
    if (String(incoming.player_id || '') !== String(previous?.player_id || '')) throw new Error(`Нельзя изменить привязанного игрока на месте #${seat} через протокол`);
    if (String(incoming.guest_placeholder_id || '') !== String(previous?.guest_placeholder_id || '')) throw new Error(`Нельзя изменить гостевую заглушку на месте #${seat} через протокол`);

    const role = canonicalRole(incoming.role);
    const regularFouls = integerInRange(incoming.regular_fouls, 0, 4, `Игрок #${seat}: обычные фолы`);
    const minorTech = integerInRange(incoming.minor_technical_fouls, 0, 2, `Игрок #${seat}: малые техфолы`);
    const majorTech = integerInRange(incoming.major_technical_fouls, 0, 2, `Игрок #${seat}: большие техфолы`);
    if (minorTech + majorTech > 2) throw new Error(`Игрок #${seat}: технических фолов не может быть больше двух`);
    const exitType = String(incoming.exit_type || 'alive');
    if (!validExitTypes.has(exitType)) throw new Error(`Игрок #${seat}: некорректный статус выхода`);
    const removalReason = incoming.removal_reason ? String(incoming.removal_reason) : null;
    if (removalReason && !validRemovalReasons.has(removalReason)) throw new Error(`Игрок #${seat}: некорректная причина удаления`);
    if (removalReason && exitType !== 'removed') throw new Error(`Игрок #${seat}: причина удаления указана, но игрок не удалён`);
    const isPpkCulprit = participantId === ppkCulpritId && incomingProtocol?.end_reason === 'ppk';
    const disciplinaryPenalty = calculateDisciplinaryPenalty(minorTech, majorTech, exitType === 'removed', isPpkCulprit);

    return {
      ...incoming,
      participant_id: participantId,
      player_id: previous?.player_id || null,
      guest_placeholder_id: previous?.guest_placeholder_id || null,
      seat_number: seat,
      display_name: String(previous?.display_name || incoming.display_name || `Игрок ${seat}`),
      role, exit_type: exitType, regular_fouls: regularFouls,
      minor_technical_fouls: minorTech, major_technical_fouls: majorTech, technical_fouls: minorTech + majorTech,
      judge_bonus: tenthInRange(incoming.judge_bonus, -1, 1, `Игрок #${seat}: балл судьи`),
      protocol_bonus: tenthInRange(incoming.protocol_bonus, -1, 1, `Игрок #${seat}: балл за протокол`),
      penalty_points: finite(incoming.penalty_points, `Игрок #${seat}: игровой штраф`),
      disciplinary_penalty_points: disciplinaryPenalty,
      ci_points: finite(incoming.ci_points, `Игрок #${seat}: Ci`),
      removal_reason: removalReason,
      color_protocol: Array.isArray(incoming.color_protocol) ? incoming.color_protocol : [],
    };
  }).sort((a, b) => a.seat_number - b.seat_number);

  if (new Set(playerResults.map((result) => result.seat_number)).size !== tableSize) throw new Error(`В протоколе должны быть уникальные места 1–${tableSize}`);
  let winnerTeam = incomingProtocol?.winner_team === 'red' || incomingProtocol?.winner_team === 'black' ? incomingProtocol.winner_team : null;
  if (status === 'completed') {
    const roleCounts = new Map<CanonicalRole, number>(ROLE_ORDER.map((role) => [role, 0]));
    for (const result of playerResults) {
      if (!result.role) throw new Error(`Игрок #${result.seat_number}: перед завершением укажите роль`);
      roleCounts.set(result.role, (roleCounts.get(result.role) || 0) + 1);
    }
    if (!roleCountsMatchTable(Object.fromEntries(roleCounts), tableSize)) throw new Error(`Для завершения нужны роли: ${tableRolesLabel(tableSize)}`);
    if (incomingProtocol?.end_reason === 'ppk') {
      if (!ppkCulpritId) throw new Error('Для завершения по ППК укажите виновника');
      const culprit = playerResults.find((result) => result.participant_id === ppkCulpritId);
      const culpritTeam = teamFromRole(culprit?.role || null);
      if (!culpritTeam) throw new Error('Для завершения по ППК у виновника должна быть указана роль');
      winnerTeam = culpritTeam === 'red' ? 'black' : 'red';
    } else if (!winnerTeam) throw new Error('Для завершения игры укажите победившую команду');
  }

  const firstKilledId = referencedParticipant(participantIds, incomingProtocol?.first_killed_participant_id, 'Первый убитый');
  const zeroRoundId = referencedParticipant(participantIds, incomingProtocol?.zero_round_voted_participant_id, 'Нулевой круг');
  validateBestMoves(incomingProtocol, participantIds, tableSize);
  if (status === 'completed') {
    // The same consistency the tournament protocol demands: one player cannot be both, a ЛХ belongs to its source player,
    // and there is at most one ЛХ per source.
    if (firstKilledId && firstKilledId === zeroRoundId) throw new Error('Первый убитый и заголосованный в нулевой круг не могут быть одним игроком');
    const moves: any[] = Array.isArray(incomingProtocol?.best_moves) ? incomingProtocol.best_moves : [];
    if (moves.length > 2) throw new Error('Лучший ход: в игре не может быть больше двух');
    const sources = new Set<string>();
    for (const move of moves) {
      const source = String(move?.source || '');
      if (sources.has(source)) throw new Error('Лучший ход: два хода от одного источника');
      sources.add(source);
      const owner = source === 'first_killed' ? firstKilledId : zeroRoundId;
      if (!owner || String(move?.participant_id || '') !== owner) throw new Error('Лучший ход: игрок не совпадает с первым убитым / заголосованным в нулевой круг');
    }
  }
  // The chronology of the live game rides along with the protocol; manual saves that carry none keep the stored one.
  // Ci compensation (BUSINESS_RULES «Ci compensation»): only the first-killed red player, and only when his own best move
  // names a black player; at most the 0.4 rate when the reds lost and half of it when they won. The value goes straight
  // into the club Elo, so whatever a client sends beyond that is dropped.
  const blackSeats = new Set(playerResults.filter((result) => result.role === 'mafia' || result.role === 'don').map((result) => result.seat_number));
  const firstKilledMove = (Array.isArray(incomingProtocol?.best_moves) ? incomingProtocol.best_moves : [])
    .find((move: any) => move?.source === 'first_killed' && String(move?.participant_id || '') === firstKilledParticipantId);
  const firstKilledNamesBlack = Boolean(firstKilledMove) && (Array.isArray(firstKilledMove.seat_numbers) ? firstKilledMove.seat_numbers : []).some((seat: any) => blackSeats.has(Number(seat)));
  const ciCeiling = winnerTeam === 'black' ? 0.4 : winnerTeam === 'red' ? 0.2 : 0.4;
  for (const result of playerResults) {
    const eligible = result.participant_id === firstKilledParticipantId && (result.role === 'citizen' || result.role === 'sheriff') && firstKilledNamesBlack;
    result.ci_points = normalizeCi(result.ci_points, eligible, ciCeiling);
  }
  const events = Array.isArray(incomingProtocol?.events) ? sanitizeLiveGameEvents(incomingProtocol.events) : sanitizeLiveGameEvents(previousPayload?.protocol?.events);
  const blackIds = blackParticipantIds(playerResults);
  const protocol = withoutBlackLegacyBestMove({ ...incomingProtocol, best_moves: withoutBlackBestMoves(incomingProtocol?.best_moves, blackIds), events, winner_team: winnerTeam, end_reason: incomingProtocol?.end_reason === 'ppk' ? 'ppk' : 'normal', ppk_culprit_participant_id: incomingProtocol?.end_reason === 'ppk' ? ppkCulpritId : null }, blackIds);
  return { protocol, playerResults };
};
