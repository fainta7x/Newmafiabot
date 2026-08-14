import { calculateDisciplinaryPenalty } from '../../lib/gameDiscipline.ts';

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
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`${label}: допустимо от ${min} до ${max}`);
  }
  return number;
};

const tenthInRange = (value: unknown, min: number, max: number, label: string): number => {
  const number = Math.round(finite(value, label) * 10) / 10;
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

const validateBestMoves = (protocol: any, participantIds: Set<string>) => {
  const moves = Array.isArray(protocol?.best_moves) ? protocol.best_moves : [];
  for (const move of moves) {
    const participantId = referencedParticipant(participantIds, move?.participant_id, 'Лучший ход');
    if (!participantId) throw new Error('Лучший ход: не указан игрок');
    if (!['first_killed', 'zero_round_voted'].includes(String(move?.source || ''))) {
      throw new Error('Лучший ход: некорректный источник');
    }
    const seats = Array.isArray(move?.seat_numbers) ? move.seat_numbers.map(Number) : [];
    if (seats.length > 3 || new Set(seats).size !== seats.length || seats.some((seat) => !Number.isInteger(seat) || seat < 1 || seat > 10)) {
      throw new Error('Лучший ход: можно указать до 3 уникальных мест от 1 до 10');
    }
  }
};

export interface CanonicalClubGameSave {
  protocol: any;
  playerResults: any[];
}

/**
 * A club game may be corrected after completion, but its ten identities and seats
 * are immutable. Derived discipline fields are rebuilt here instead of trusting
 * a browser payload, so Elo/history/token consumers all see one canonical result.
 */
export const canonicalizeClubGameSave = (
  previousPayload: any,
  incomingProtocol: any,
  incomingResults: any[],
  status: 'draft' | 'completed',
): CanonicalClubGameSave => {
  const previousResults = Array.isArray(previousPayload?.player_results) ? previousPayload.player_results : [];
  if (previousResults.length !== 10) throw new Error('У исходной игры повреждён состав: ожидается 10 игроков');
  if (!Array.isArray(incomingResults) || incomingResults.length !== 10) throw new Error('Для игры нужны результаты ровно 10 игроков');

  const previousByParticipant = new Map(previousResults.map((result: any) => [String(result.participant_id || ''), result]));
  const incomingIds = incomingResults.map((result: any) => String(result?.participant_id || '').trim());
  if (incomingIds.some((id) => !id) || new Set(incomingIds).size !== 10) {
    throw new Error('В протоколе должны быть 10 уникальных участников');
  }
  if (incomingIds.some((id) => !previousByParticipant.has(id))) {
    throw new Error('Нельзя заменить состав уже созданной игры через протокол');
  }

  const ppkCulpritId = String(incomingProtocol?.ppk_culprit_participant_id || '').trim() || null;
  const participantIds = new Set(incomingIds);
  if (ppkCulpritId && !participantIds.has(ppkCulpritId)) throw new Error('Виновник ППК не относится к этой игре');

  const playerResults = incomingResults
    .map((incoming: any) => {
      const participantId = String(incoming.participant_id);
      const previous = previousByParticipant.get(participantId);
      const seat = Number(previous?.seat_number);
      if (Number(incoming.seat_number) !== seat) throw new Error(`Нельзя изменить место игрока #${seat} через протокол`);
      if (String(incoming.player_id || '') !== String(previous?.player_id || '')) {
        throw new Error(`Нельзя изменить привязанного игрока на месте #${seat} через протокол`);
      }

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
        player_id: String(previous?.player_id || ''),
        seat_number: seat,
        display_name: String(previous?.display_name || incoming.display_name || `Игрок ${seat}`),
        role,
        exit_type: exitType,
        regular_fouls: regularFouls,
        minor_technical_fouls: minorTech,
        major_technical_fouls: majorTech,
        technical_fouls: minorTech + majorTech,
        judge_bonus: tenthInRange(incoming.judge_bonus, -1, 1, `Игрок #${seat}: балл судьи`),
        protocol_bonus: tenthInRange(incoming.protocol_bonus, -1, 1, `Игрок #${seat}: балл за протокол`),
        penalty_points: finite(incoming.penalty_points, `Игрок #${seat}: игровой штраф`),
        disciplinary_penalty_points: disciplinaryPenalty,
        ci_points: finite(incoming.ci_points, `Игрок #${seat}: Ci`),
        removal_reason: removalReason,
        color_protocol: Array.isArray(incoming.color_protocol) ? incoming.color_protocol : [],
      };
    })
    .sort((a, b) => a.seat_number - b.seat_number);

  if (new Set(playerResults.map((result) => result.seat_number)).size !== 10) {
    throw new Error('В протоколе должны быть уникальные места 1–10');
  }

  const winnerTeam = incomingProtocol?.winner_team === 'red' || incomingProtocol?.winner_team === 'black'
    ? incomingProtocol.winner_team
    : null;

  if (status === 'completed') {
    if (!winnerTeam) throw new Error('Для завершения игры укажите победившую команду');
    const roleCounts = new Map<CanonicalRole, number>(ROLE_ORDER.map((role) => [role, 0]));
    for (const result of playerResults) {
      if (!result.role) throw new Error(`Игрок #${result.seat_number}: перед завершением укажите роль`);
      roleCounts.set(result.role, (roleCounts.get(result.role) || 0) + 1);
    }
    if (roleCounts.get('citizen') !== 6 || roleCounts.get('sheriff') !== 1 || roleCounts.get('mafia') !== 2 || roleCounts.get('don') !== 1) {
      throw new Error('Для завершения нужны роли: 6 мирных, 1 Шериф, 2 мафии и 1 Дон');
    }

    if (incomingProtocol?.end_reason === 'ppk') {
      if (!ppkCulpritId) throw new Error('Для завершения по ППК укажите виновника');
      const culprit = playerResults.find((result) => result.participant_id === ppkCulpritId);
      const culpritTeam = teamFromRole(culprit?.role || null);
      if (!culpritTeam || winnerTeam === culpritTeam) throw new Error('При ППК должна победить противоположная команда');
    }
  }

  referencedParticipant(participantIds, incomingProtocol?.first_killed_participant_id, 'Первый убитый');
  referencedParticipant(participantIds, incomingProtocol?.zero_round_voted_participant_id, 'Нулевой круг');
  validateBestMoves(incomingProtocol, participantIds);

  const protocol = {
    ...incomingProtocol,
    winner_team: winnerTeam,
    end_reason: incomingProtocol?.end_reason === 'ppk' ? 'ppk' : 'normal',
    ppk_culprit_participant_id: incomingProtocol?.end_reason === 'ppk' ? ppkCulpritId : null,
  };

  return { protocol, playerResults };
};
