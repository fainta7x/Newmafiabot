/**
 * Pure projection of the existing verified profile awards into a trophy cabinet.
 * No claims of placement or ownership can be created by this frontend mapping.
 */
export type CabinetVerifiedAward = {
  id: string;
  kind: string;
  title: string;
  tournament_id?: string | null;
  source_key?: string | null;
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
  /** Real canonical tournament ID. Never infer navigation from a displayed title. */
  tournamentId: string | null;
  /** Only automatic club-evening titles have this trustworthy ID. */
  eveningId: string | null;
  /** Every documented tournament has stable, reproducible personalized details. */
  trophyDesignKey: string | null;
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

/** First two numbered tournament trophies use different sculpted families. New tournaments
 * receive a stable family and an individualized engraving, independent of award owner.
 * Name/ID alone never grants a trophy: that is decided by the verified awards service. */
export const trophyDesignForTournament = (id: string | null | undefined, title: string | null | undefined): string | null => {
  const key = String(id || title || '').trim();
  if (!key) return null;
  const name = String(title || '');
  // Numbered editions are common in tournament names; 1 and 2 must not share a silhouette.
  const edition = name.match(/(?:^|\s)(?:№\s*)?([1-9]\d?)(?=\s*(?:[.\/-]\s*\d{1,2})?(?:\s|$))/u);
  const families = ['spire', 'amphora', 'laurel', 'obelisk'] as const;
  let checksum = 2166136261;
  for (const ch of key) checksum = Math.imul(checksum ^ ch.charCodeAt(0), 16777619) >>> 0;
  const index = edition ? (Number(edition[1]) - 1) % families.length : checksum % families.length;
  return families[index] + ':' + checksum.toString(36).toUpperCase().slice(0, 5);
};

export const eveningIdFromAward = (sourceKey?: string | null): string | null => {
  const value = String(sourceKey || '');
  if (!/^club-evening-(?:mvp|wins):/.test(value)) return null;
  const first = value.indexOf(':');
  const last = value.lastIndexOf(':');
  return first >= 0 && last > first + 1 ? value.slice(first + 1, last) : null;
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
      tournamentId: award.tournament_id ? String(award.tournament_id) : null,
      eveningId: eveningIdFromAward(award.source_key),
      trophyDesignKey: category === 'cups' ? trophyDesignForTournament(award.tournament_id, award.tournament_name) : null,
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
      tournamentId: null,
      eveningId: null,
      trophyDesignKey: null,
      pinned: false,
      photoUrl: null,
      tournamentWinner: false,
    });
  }
  return items.sort((a, b) => Number(b.pinned) - Number(a.pinned) || String(b.date || '').localeCompare(String(a.date || '')) || a.id.localeCompare(b.id));
};
