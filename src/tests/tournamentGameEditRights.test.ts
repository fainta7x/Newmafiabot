import { describe, expect, it } from 'vitest';
import { tournamentGameEditRights } from '../components/crm/tournaments/tournamentGameEditRights.ts';

const game = (id: string, status: string, protocol_status: string | null = null, roles: Array<string | null> = []) => ({
  id, status, protocol_status, game_number: Number(id.replace(/\D/g, '')) || 1,
  seats: roles.map((role, index) => ({ seat_number: index + 1, role })),
}) as any;

const rights = (tournamentStatus: string, current: any, others: any[] = []) =>
  tournamentGameEditRights(tournamentStatus, [current, ...others], current);

describe('what may change in a tournament game', () => {
  it('counts the roles of the selected game', () => {
    const current = game('g1', 'planned', null, ['citizen', 'citizen', 'sheriff', 'mafia', 'don', null]);
    expect(rights('draft', current).roleCounts).toEqual({ citizen: 2, sheriff: 1, mafia: 1, don: 1 });
  });

  it('a planned game of a draft or running tournament: judge, roles and seats', () => {
    for (const status of ['draft', 'active']) {
      const r = rights(status, game('g1', 'planned'));
      expect(r).toMatchObject({ canEditCurrentGameJudgeAndRoles: true, canEditJudgeInline: true, canSwapSeatsCurrentGame: true, isCorrection: false });
    }
  });

  it('a running game of a running tournament: only the judge, until its protocol is completed', () => {
    expect(rights('active', game('g1', 'active', 'draft'))).toMatchObject({ canEditCurrentGameJudgeAndRoles: false, canEditJudgeInline: true, canSwapSeatsCurrentGame: false });
    expect(rights('active', game('g1', 'active', 'completed'))).toMatchObject({ canEditCurrentGameJudgeAndRoles: false, canEditJudgeInline: false, canSwapSeatsCurrentGame: false });
  });

  it('correction: a reopened game with a draft protocol, unless another game is running', () => {
    expect(rights('correction', game('g1', 'active', 'draft'))).toMatchObject({ isCorrection: true, canEditCurrentGameJudgeAndRoles: true, canEditJudgeInline: true, canSwapSeatsCurrentGame: true });
    const blocked = rights('correction', game('g1', 'active', 'draft'), [game('g2', 'active', 'draft')]);
    expect(blocked.isAnotherGameActive).toBe(false);
    // The first active game found is the selected one itself, so the other running game does not block it.
    const other = tournamentGameEditRights('correction', [game('g2', 'active', 'draft'), game('g1', 'active', 'draft')], game('g1', 'active', 'draft'));
    expect(other).toMatchObject({ isAnotherGameActive: true, canEditCurrentGameJudgeAndRoles: false, canSwapSeatsCurrentGame: false, canEditJudgeInline: false });
    expect(other.activeGameInTournament?.id).toBe('g2');
    expect(rights('correction', game('g1', 'active', 'completed'))).toMatchObject({ canEditCurrentGameJudgeAndRoles: false, canSwapSeatsCurrentGame: false });
  });

  it('nothing in completed games or tournaments, nor without a selected game', () => {
    expect(rights('active', game('g1', 'completed', 'completed'))).toMatchObject({ canEditCurrentGameJudgeAndRoles: false, canEditJudgeInline: false, canSwapSeatsCurrentGame: false });
    expect(rights('completed', game('g1', 'planned'))).toMatchObject({ canEditCurrentGameJudgeAndRoles: false, canSwapSeatsCurrentGame: false });
    const none = tournamentGameEditRights('active', [], undefined);
    expect(none).toMatchObject({ canEditCurrentGameJudgeAndRoles: false, canEditJudgeInline: false, canSwapSeatsCurrentGame: false, isAnotherGameActive: false });
    expect(none.roleCounts).toEqual({ citizen: 0, sheriff: 0, mafia: 0, don: 0 });
  });
});
