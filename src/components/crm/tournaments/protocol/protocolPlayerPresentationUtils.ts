import type { PlayerResultData } from '../../../../lib/api';
import { calculateDisciplinaryPenalty } from '../../../../lib/gameDiscipline';
import { formatSignedBonus } from './protocolUtils';

export interface PlayerBriefBadge {
  key: string;
  label: string;
  className: string;
}

export interface ProtocolPlayerPresentation {
  hasColorProtocol: boolean;
  isPpkCulprit: boolean;
  disciplinaryPenalty: number;
  briefBadges: PlayerBriefBadge[];
  roleLabel: string;
  roleClass: string;
  statusLabel: string | null;
  statusClass: string;
}

const getRolePresentation = (
  role: PlayerResultData['role']
): Pick<ProtocolPlayerPresentation, 'roleLabel' | 'roleClass'> => {
  if (role === 'citizen') {
    return {
      roleLabel: 'Мирный',
      roleClass: 'bg-transparent text-text-secondary border-border-soft'
    };
  }

  if (role === 'sheriff') {
    return {
      roleLabel: 'Шериф',
      roleClass: 'bg-warning-soft text-warning border-warning/30'
    };
  }

  if (role === 'mafia') {
    return {
      roleLabel: 'Мафия',
      roleClass: 'bg-danger-soft text-danger border-danger/30'
    };
  }

  if (role === 'don') {
    return {
      roleLabel: 'Дон',
      roleClass: 'bg-accent-soft text-accent border-accent/30'
    };
  }

  return {
    roleLabel: 'Не указана',
    roleClass: 'bg-transparent text-text-secondary border-border-soft'
  };
};

const getStatusPresentation = (
  player: PlayerResultData
): Pick<ProtocolPlayerPresentation, 'statusLabel' | 'statusClass'> => {
  if (player.exit_type === 'killed') {
    return {
      statusLabel: 'Убит',
      statusClass: 'bg-danger-soft text-danger border-danger/30'
    };
  }

  if (player.exit_type === 'voted_zero_round') {
    return {
      statusLabel: 'Загол. (0)',
      statusClass: 'bg-warning-soft text-warning border-warning/30'
    };
  }

  if (player.exit_type === 'voted_day') {
    return {
      statusLabel: 'Заголосован',
      statusClass: 'bg-warning-soft text-warning border-warning/30'
    };
  }

  if (player.exit_type === 'removed') {
    let statusLabel = 'Снят';

    if (player.removal_reason === '4th_foul') {
      statusLabel = '4 фола';
    } else if (player.removal_reason === '2nd_tech') {
      statusLabel = '2 техфола';
    } else if (player.removal_reason === 'direct') {
      statusLabel = 'Удалён';
    } else if ((player.removal_reason as unknown as string) === 'ppk') {
      statusLabel = 'ППК';
    }

    return {
      statusLabel,
      statusClass: 'bg-accent-soft text-accent border-accent/30'
    };
  }

  return {
    statusLabel: null,
    statusClass: 'bg-transparent text-text-secondary border-border-soft'
  };
};

export const getProtocolPlayerPresentation = (
  player: PlayerResultData,
  ppkCulpritParticipantId?: string | null
): ProtocolPlayerPresentation => {
  const hasColorProtocol =
    Array.isArray(player.color_protocol) &&
    player.color_protocol.length > 0;
  const isPpkCulprit =
    ppkCulpritParticipantId === player.participant_id ||
    (player.removal_reason as unknown as string) === 'ppk';

  const disciplinaryPenalty = calculateDisciplinaryPenalty(
    player.minor_technical_fouls || 0,
    player.major_technical_fouls || 0,
    player.exit_type === 'removed',
    isPpkCulprit
  );

  const briefBadges: PlayerBriefBadge[] = [];

  if ((player.regular_fouls || 0) > 0) {
    briefBadges.push({
      key: 'fouls',
      label: `Ф: ${player.regular_fouls}`,
      className: 'bg-warning-soft text-warning border-warning/30'
    });
  }

  if ((player.minor_technical_fouls || 0) > 0) {
    briefBadges.push({
      key: 'minor_tech',
      label: `мТ: ${player.minor_technical_fouls}`,
      className: 'bg-danger-soft text-danger border-danger/30'
    });
  }

  if ((player.major_technical_fouls || 0) > 0) {
    briefBadges.push({
      key: 'major_tech',
      label: `бТ: ${player.major_technical_fouls}`,
      className: 'bg-danger-soft text-danger border-danger/30'
    });
  }

  const roundedPenalty = Math.round(disciplinaryPenalty * 10) / 10;
  if (roundedPenalty > 0) {
    briefBadges.push({
      key: 'disc',
      label: `Дисц. −${roundedPenalty}`,
      className: 'bg-danger-soft text-danger border-danger/30'
    });
  }

  const judgeBonus = formatSignedBonus(player.judge_bonus);
  if (judgeBonus.sign === 'positive') {
    briefBadges.push({
      key: 'judge',
      label: `Судья ${judgeBonus.formatted}`,
      className: 'bg-accent-soft text-accent border-accent/30'
    });
  } else if (judgeBonus.sign === 'negative') {
    briefBadges.push({
      key: 'judge',
      label: `Судья ${judgeBonus.formatted}`,
      className: 'bg-accent-soft text-accent border-accent/30'
    });
  }

  const protocolBonus = formatSignedBonus(player.protocol_bonus);
  if (protocolBonus.sign === 'positive') {
    briefBadges.push({
      key: 'proto',
      label: `Прот. ${protocolBonus.formatted}`,
      className: 'bg-success-soft text-success border-success/30'
    });
  } else if (protocolBonus.sign === 'negative') {
    briefBadges.push({
      key: 'proto',
      label: `Прот. ${protocolBonus.formatted}`,
      className: 'bg-accent-soft text-accent border-accent/30'
    });
  }

  if (isPpkCulprit) {
    briefBadges.push({
      key: 'ppk',
      label: 'ППК',
      className:
        'bg-warning-soft text-warning border-warning/40 font-bold'
    });
  }

  if (player.removal_reason === 'direct') {
    briefBadges.push({
      key: 'direct',
      label: 'Удалён',
      className:
        'bg-danger-soft text-danger border-danger/40 font-bold'
    });
  }

  if (hasColorProtocol) {
    briefBadges.push({
      key: 'color_proto',
      label: 'Есть цветовой протокол',
      className: 'bg-transparent text-text-secondary border-border-soft'
    });
  }

  return {
    hasColorProtocol,
    isPpkCulprit,
    disciplinaryPenalty,
    briefBadges,
    ...getRolePresentation(player.role),
    ...getStatusPresentation(player)
  };
};
