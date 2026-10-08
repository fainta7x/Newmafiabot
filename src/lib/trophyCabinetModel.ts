/**
 * Pure projection of the existing verified profile awards into a trophy cabinet.
 * No claims of placement or ownership can be created by this frontend mapping.
 */
export type CabinetVerifiedAward = {
  id: string;
  kind: string;
  title: string;
  tournament_id?: string | null;
  tournament_name?: string | null;
  award_date?: string | null;
  award_year?: number | null;
  place_result?: string | null;
  description?: string | null;
  photo_url?: string | null;
  pinned_position?: number | null;
  verification_status?: string | null;
};

export type CabinetAchievement = {
  id: string;
  name: string;
  description: string;
  icon?: string | null;
  earned_at: string | null;
  category_name?: string;
};

export type CabinetCategory = 'cups' | 'medals' | 'nominations' | 'achievements';

export type CabinetItem = {
  id: string;
  category: CabinetCategory;
  shape: 'cup' | 'medal' | 'plaque';
  title: string;
  context: string | null;
  date: string | null;
  description: string | null;
  awardId: string | null;
  pinned: boolean;
  photoUrl: string | null;
  /** Verified first place; not a decorative "winner" badge created by the room. */
  tournamentWinner: boolean;
};

export const CABINET_CATEGORIES: Array<{ id: CabinetCategory; title: string }> = [
  { id: 'cups', title: 'Кубки' },
  { id: 'medals', title: 'Медали' },
  { id: 'nominations', title: 'Номинации' },
  { id: 'achievements', title: 'Достижения' },
];

export const isFirstPlace = (raw?: string | null) => {
  const text = String(raw || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  return /(?:^|[^\d])1\s*(?:-?\s*(?:е|ое|й|я)\s*)?место(?![а-яёa-z0-9])/i.test(text);
};

export const isMedalPlace = (raw?: string | null) => {
  const text = String(raw || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  return /(?:^|[^\d])[23]\s*(?:-?\s*(?:е|ое|й|я)\s*)?место(?:\b|$)/i.test(text);
};

export const cabinetItems = (awards: CabinetVerifiedAward[], achievements: CabinetAchievement[]): CabinetItem[] => {
  const verified = awards.filter(a => a.verification_status === undefined || a.verification_status === null || a.verification_status === 'verified');
  const items: CabinetItem[] = verified.map(award => {
    const first = award.kind === 'placement' && isFirstPlace(award.place_result) && Boolean(award.tournament_id || award.tournament_name);
    const category: CabinetCategory =
      first || award.kind === 'trophy' ? 'cups'
        : isMedalPlace(award.place_result) || award.kind === 'medal' || award.kind === 'placement' ? 'medals'
          : 'nominations';
    return {
      id: 'award:' + award.id,
      category,
      shape: category === 'cups' ? 'cup' : category === 'medals' ? 'medal' : 'plaque',
      title: String(award.title),
      context: award.tournament_name || null,
      date: award.award_date || (award.award_year ? String(award.award_year) : null),
      description: award.description || award.place_result || null,
      awardId: award.id,
      pinned: Number(award.pinned_position || 0) > 0,
      photoUrl: award.photo_url || null,
      tournamentWinner: first,
    };
  });
  // Only earned achievements; locked achievements never appear as won trophies.
  for (const achievement of achievements) {
    if (!achievement.earned_at) continue;
    items.push({
      id: 'achievement:' + achievement.id,
      category: 'achievements',
      shape: 'plaque',
      title: achievement.name,
      context: achievement.category_name || null,
      date: achievement.earned_at,
      description: achievement.description || null,
      awardId: null,
      pinned: false,
      photoUrl: null,
      tournamentWinner: false,
    });
  }
  return items.sort((a, b) => Number(b.pinned) - Number(a.pinned) || String(b.date || '').localeCompare(String(a.date || '')) || a.id.localeCompare(b.id));
};
