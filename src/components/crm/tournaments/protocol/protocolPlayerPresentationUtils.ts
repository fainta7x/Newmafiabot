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
      roleClass: 'bg-sky-500/10 text-sky-400 border-sky-500/30'
    };
  }

  if (role === 'sheriff') {
    return {
      roleLabel: 'Шериф',
      roleClass: 'bg-amber-500/10 text-amber-400 border-amber-500/30'
    };
  }

  if (role === 'mafia') {
    return {
      roleLabel: 'Мафия',
      roleClass: 'bg-rose-500/10 text-rose-400 border-rose-500/30'
    };
  }

  if (role === 'don') {
    return {
      roleLabel: 'Дон',
      roleClass: 'bg-purple-500/10 text-purple-400 border-purple-500/30'
    };
  }

  return {
    roleLabel: 'Не указана',
    roleClass: 'bg-slate-800 text-slate-400 border-slate-700'
  };
};

const getStatusPresentation = (
  player: PlayerResultData
): Pick<ProtocolPlayerPresentation, 'statusLabel' | 'statusClass'> => {
  if (player.exit_type === 'killed') {
    return {
      statusLabel: 'Убит',
      statusClass: 'bg-rose-500/20 text-rose-400 border-rose-500/30'
    };
  }

  if (player.exit_type === 'voted_zero_round') {
    return {
      statusLabel: 'Загол. (0)',
      statusClass: 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    };
  }

  if (player.exit_type === 'voted_day') {
    return {
      statusLabel: 'Заголосован',
      statusClass: 'bg-amber-500/20 text-amber-400 border-amber-500/30'
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
      statusClass: 'bg-purple-500/20 text-purple-300 border-purple-500/30'
    };
  }

  return {
    statusLabel: null,
    statusClass: 'bg-slate-800 text-slate-400 border-slate-700'
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
      className: 'bg-amber-500/10 text-amber-400 border-amber-500/30'
    });
  }

  if ((player.minor_technical_fouls || 0) > 0) {
    briefBadges.push({
      key: 'minor_tech',
      label: `мТ: ${player.minor_technical_fouls}`,
      className: 'bg-rose-500/10 text-rose-400 border-rose-500/30'
    });
  }

  if ((player.major_technical_fouls || 0) > 0) {
    briefBadges.push({
      key: 'major_tech',
      label: `бТ: ${player.major_technical_fouls}`,
      className: 'bg-rose-600/10 text-rose-400 border-rose-600/30'
    });
  }

  const roundedPenalty = Math.round(disciplinaryPenalty * 10) / 10;
  if (roundedPenalty > 0) {
    briefBadges.push({
      key: 'disc',
      label: `Дисц. −${roundedPenalty}`,
      className: 'bg-purple-500/10 text-purple-300 border-purple-500/30'
    });
  }

  const judgeBonus = formatSignedBonus(player.judge_bonus);
  if (judgeBonus.sign === 'positive') {
    briefBadges.push({
      key: 'judge',
      label: `Судья ${judgeBonus.formatted}`,
      className: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
    });
  } else if (judgeBonus.sign === 'negative') {
    briefBadges.push({
      key: 'judge',
      label: `Судья ${judgeBonus.formatted}`,
      className: 'bg-rose-500/10 text-rose-300 border-rose-500/30'
    });
  }

  const protocolBonus = formatSignedBonus(player.protocol_bonus);
  if (protocolBonus.sign === 'positive') {
    briefBadges.push({
      key: 'proto',
      label: `Прот. ${protocolBonus.formatted}`,
      className: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
    });
  } else if (protocolBonus.sign === 'negative') {
    briefBadges.push({
      key: 'proto',
      label: `Прот. ${protocolBonus.formatted}`,
      className: 'bg-rose-500/10 text-rose-300 border-rose-500/30'
    });
  }

  if (isPpkCulprit) {
    briefBadges.push({
      key: 'ppk',
      label: 'ППК',
      className:
        'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold'
    });
  }

  if (player.removal_reason === 'direct') {
    briefBadges.push({
      key: 'direct',
      label: 'Удалён',
      className:
        'bg-rose-500/20 text-rose-300 border-rose-500/40 font-bold'
    });
  }

  if (hasColorProtocol) {
    briefBadges.push({
      key: 'color_proto',
      label: 'Есть цветовой протокол',
      className: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
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
