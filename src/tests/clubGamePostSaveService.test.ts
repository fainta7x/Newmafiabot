import { afterEach, describe, expect, it, vi } from 'vitest';
import { runClubGamePostSaveTasks } from '../server/services/clubGamePostSaveService.ts';

describe('club game post-save derived updates', () => {
  afterEach(() => vi.restoreAllMocks());

  it('does not reject an already committed final save when Elo fails and avoids stale rating achievements', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const rebuildElo = vi.fn().mockRejectedValue(new Error('elo unavailable'));
    const evaluateAchievements = vi.fn();

    const result = await runClubGamePostSaveTasks(
      {},
      {
        gameId: 91,
        previousStatus: 'draft',
        status: 'completed',
        playerIds: ['p1', 'p2'],
        judgePlayerId: 'judge-1',
      },
      { rebuildElo: rebuildElo as any, evaluateAchievements: evaluateAchievements as any },
    );

    expect(result.warnings).toEqual([
      'Elo: elo unavailable',
      'Достижения: пропущены до успешного пересчёта Elo',
    ]);
    expect(rebuildElo).toHaveBeenCalledTimes(1);
    expect(evaluateAchievements).not.toHaveBeenCalled();
  });

  it('still acknowledges the save when achievement evaluation itself fails after a good Elo rebuild', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const rebuildElo = vi.fn().mockResolvedValue([]);
    const evaluateAchievements = vi.fn().mockRejectedValue(new Error('achievements unavailable'));

    const result = await runClubGamePostSaveTasks(
      {},
      {
        gameId: 93,
        previousStatus: 'draft',
        status: 'completed',
        playerIds: ['p1', 'p2'],
        judgePlayerId: 'judge-1',
      },
      { rebuildElo: rebuildElo as any, evaluateAchievements: evaluateAchievements as any },
    );

    expect(result.warnings).toEqual(['Достижения: achievements unavailable']);
    expect(evaluateAchievements).toHaveBeenCalledWith({}, ['p1', 'p2', 'judge-1']);
  });

  it('keeps reopen/correction Elo reconciliation but skips achievements for a draft', async () => {
    const rebuildElo = vi.fn().mockResolvedValue([]);
    const evaluateAchievements = vi.fn();

    const result = await runClubGamePostSaveTasks(
      {},
      {
        gameId: 92,
        previousStatus: 'completed',
        status: 'draft',
        playerIds: ['p1'],
      },
      { rebuildElo: rebuildElo as any, evaluateAchievements: evaluateAchievements as any },
    );

    expect(result.warnings).toEqual([]);
    expect(rebuildElo).toHaveBeenCalledTimes(1);
    expect(evaluateAchievements).not.toHaveBeenCalled();
  });
});
