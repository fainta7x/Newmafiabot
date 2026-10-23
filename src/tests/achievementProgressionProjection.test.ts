import { describe, expect, it } from 'vitest';
import { achievementProgressionFromProfile, type PlayerAchievementProfile } from '../server/services/playerAchievementsService.ts';

const profile = (earned: boolean, current: number): PlayerAchievementProfile => ({
  earned: earned ? 1 : 0, total: 1, percentage: earned ? 100 : 0,
  categories: [{ id: 'learning', name: 'Обучение', icon: '🎓', order: 1, earned: earned ? 1 : 0, total: 1, percentage: earned ? 100 : 0,
    achievements: [{ id: 'organizer-edited', name: 'Моё достижение', description: 'Условие организатора', icon: '⭐', rarity: 'epic', rarity_name: 'Эпическое', rarity_icon: '🟣', earned, earned_at: earned ? '2026-10-01T10:00:00.000Z' : null, progress: { current, target: 3 } }],
  }],
});

describe('progression uses the canonical achievement profile', () => {
  it('preserves an organizer grant, editable wording and original earned date even below the numeric target', () => {
    expect(achievementProgressionFromProfile(profile(true, 0))).toEqual([{
      id: 'organizer-edited', name: 'Моё достижение', description: 'Условие организатора', icon: '⭐', rarity: 'epic', category: 'learning', progress: 3, target: 3, completed: true, earned_at: '2026-10-01T10:00:00.000Z',
    }]);
  });

  it('does not re-grant a revoked achievement merely because its metric reaches the target', () => {
    expect(achievementProgressionFromProfile(profile(false, 5))[0]).toMatchObject({ progress: 3, completed: false, earned_at: null });
  });

  it('does not reintroduce achievements omitted from the active canonical catalog', () => {
    expect(achievementProgressionFromProfile({ earned: 0, total: 0, percentage: 0, categories: [] })).toEqual([]);
  });
});
