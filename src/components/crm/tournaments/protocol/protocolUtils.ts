import {
  PlayerResultData,
  TournamentGameProtocolData
} from '../../../../lib/api';
import { calculateDisciplinaryPenalty } from '../../../../lib/gameDiscipline';

export function formatColorMark(entry: {
  seat_numbers: number[];
  mark: 'red' | 'black' | 'sheriff';
}): string {
  if (!entry || !entry.seat_numbers) return '';
  const sorted = [...entry.seat_numbers].sort((a, b) => a - b);
  const markLabel = entry.mark === 'red' ? 'кр' : entry.mark === 'black' ? 'ч' : 'ш';
  return `${sorted.join(' ')} ${markLabel}`;
}

export function formatSignedBonus(
  val: number | null | undefined
): { formatted: string; sign: 'positive' | 'negative' | 'zero'; num: number } {
  if (val == null) return { formatted: '0', sign: 'zero', num: 0 };
  const rounded = Math.round(val * 10) / 10;
  if (Math.abs(rounded) === 0 || Object.is(rounded, -0)) {
    return { formatted: '0', sign: 'zero', num: 0 };
  }
  if (rounded > 0) {
    return { formatted: `+${rounded}`, sign: 'positive', num: rounded };
  }
  return { formatted: `−${Math.abs(rounded)}`, sign: 'negative', num: rounded };
}

export const strictParseDecimal = (val: string): number | null => {
  if (!val || val.trim() === '') return 0;
  const normalized = val.replace(',', '.').trim();

  // Check for valid decimal format
  // Matches optional leading dot, digits, optional decimal point and digits
  // But also needs to handle things like ".5"
  if (!/^\d*\.?\d*$/.test(normalized) || normalized === '.') {
    return null;
  }

  const parsed = parseFloat(normalized);
  if (isNaN(parsed) || !Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
};

export const buildLegacyTechFoulClassification = (
  minor: number,
  major: number
): Partial<PlayerResultData> => {
  const total = minor + major;
  const updates: Partial<PlayerResultData> = {
    minor_technical_fouls: minor,
    major_technical_fouls: major,
    technical_fouls: total
  };

  if (total === 2) {
    updates.exit_type = 'removed';
    updates.removal_reason = '2nd_tech';
  }

  return updates;
};

export const getProtocolPayload = (
  proto: TournamentGameProtocolData,
  results: PlayerResultData[]
) => {
  return {
    protocol: {
      ...proto,
      winner_team: proto.winner_team,
      end_reason: proto.end_reason || 'normal',
      ppk_culprit_participant_id: proto.ppk_culprit_participant_id || null,
      first_killed_participant_id: proto.first_killed_participant_id || null,
      zero_round_voted_participant_id: proto.zero_round_voted_participant_id || null,
    },
    player_results: results.map((pr) => ({
      participant_id: pr.participant_id,
      exit_type: pr.exit_type,
      exit_order: pr.exit_order,
      regular_fouls: pr.regular_fouls,
      minor_technical_fouls: pr.minor_technical_fouls || 0,
      major_technical_fouls: pr.major_technical_fouls || 0,
      technical_fouls: (pr.minor_technical_fouls || 0) + (pr.major_technical_fouls || 0),
      judge_bonus: pr.judge_bonus,
      protocol_bonus: pr.protocol_bonus,
      penalty_points: 0,
      disciplinary_penalty_points: calculateDisciplinaryPenalty(
        pr.minor_technical_fouls || 0,
        pr.major_technical_fouls || 0,
        pr.exit_type === 'removed',
        proto.ppk_culprit_participant_id === pr.participant_id
      ),
      removal_reason: pr.removal_reason,
      color_protocol: pr.color_protocol || [],
      notes: pr.notes
    }))
  };
};
