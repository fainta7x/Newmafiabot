export type ContactStatus = 'normal' | 'paused' | 'blocked';
export type EngagementStage = 'lead' | 'newcomer' | 'returning' | 'regular' | 'inactive';

export interface CanInviteResult {
  canInvite: boolean;
  reason: string;
}

/**
 * Calculates dynamic engagement stage based on attendance count and last visit date.
 * Rules:
 * - 0 visits -> lead
 * - 1 visit (last visit <= 45 days ago) -> newcomer
 * - 2-3 visits (last visit <= 45 days ago) -> returning
 * - 4+ visits (last visit <= 45 days ago) -> regular
 * - 1+ visits (last visit > 45 days ago) -> inactive
 *
 * do_not_invite_until and contact_status do NOT alter engagement_stage.
 */
export function calculateEngagementStage(
  attendanceCount: number,
  lastVisit: string | Date | null | undefined,
  now: Date = new Date()
): EngagementStage {
  if (!attendanceCount || attendanceCount <= 0 || !lastVisit) {
    return 'lead';
  }

  const lastVisitDate = new Date(lastVisit);
  if (isNaN(lastVisitDate.getTime())) {
    return 'lead';
  }

  const diffMs = now.getTime() - lastVisitDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays > 45) {
    return 'inactive';
  }

  if (attendanceCount === 1) {
    return 'newcomer';
  } else if (attendanceCount >= 2 && attendanceCount <= 3) {
    return 'returning';
  } else {
    return 'regular';
  }
}

/**
 * Checks whether player can be invited right now and returns human-readable Russian reason if not.
 */
export function getCanInviteStatus(player: {
  contact_status?: string | null;
  lifecycle_status?: string | null;
  do_not_invite_until?: string | null;
}, now: Date = new Date()): CanInviteResult {
  const contactStatus = player.contact_status || (player.lifecycle_status === 'blocked' ? 'blocked' : player.lifecycle_status === 'paused' ? 'paused' : 'normal');

  if (contactStatus === 'blocked') {
    return { canInvite: false, reason: 'Игрок заблокирован' };
  }

  if (contactStatus === 'paused') {
    return { canInvite: false, reason: 'Контакт на паузе' };
  }

  if (player.do_not_invite_until) {
    const pauseDate = new Date(player.do_not_invite_until);
    if (!isNaN(pauseDate.getTime()) && pauseDate.getTime() > now.getTime()) {
      const formattedDate = pauseDate.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      return { canInvite: false, reason: `Временно не приглашать до ${formattedDate}` };
    }
  }

  return { canInvite: true, reason: 'Можно приглашать' };
}

export function getRussianContactStatusLabel(status?: string | null): string {
  switch (status) {
    case 'paused':
      return 'На паузе';
    case 'blocked':
      return 'Заблокирован';
    case 'normal':
    default:
      return 'Можно связываться';
  }
}

export function getRussianEngagementStageLabel(stage?: string | null): string {
  switch (stage) {
    case 'lead':
      return 'Лид';
    case 'newcomer':
      return 'Новичок';
    case 'returning':
      return 'Вернувшийся';
    case 'regular':
      return 'Постоянный';
    case 'inactive':
      return 'Неактивный';
    default:
      return stage || 'Лид';
  }
}
