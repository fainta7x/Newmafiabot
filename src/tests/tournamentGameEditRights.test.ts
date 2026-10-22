import { describe, expect, it } from 'vitest';
import { tournamentGameEditRights } from '../components/crm/tournaments/tournamentGameEditRights.ts';

const game = (id: string, status: string, protocol_status: string | null = null, roles: Array<string | null> = []) => ({
  id, status, protocol_status, game_number: Number(id.replace(/\D/g, '')) || 1,
  seats: roles.map((role, index) => ({ seat_number: index + 1, role })),
}) as any;

const rights = (tournamentStatus: string, current: any, others: any[] = []) =>
  tournamentGameEditRights(tournamentStatus, [current, ...others], current);

describe('what may change in a tournament game (owner, 2026-10-22: as flexible as possible)', () => {
  it('counts the roles of the selected game', () => {
    const current = game('g1', 'planned', null, ['citizen', 'citizen', 'sheriff', 'mafia', 'don', null]);
    expect(rights('draft', current).roleCounts).toEqual({ citizen: 2, sheriff: 1, mafia: 1, don: 1 });
  });

  it('a game that has not started: judge, roles and seats in a draft, running or reopened tournament', () => {
    for (const status of ['draft', 'active', 'correction']) {
      expect(rights(status, game('g1', 'planned'))).toMatchObject({ canEditCurrentGameJudgeAndRoles: true, canEditJudgeInline: true, canSwapSeatsCurrentGame: true, canCorrectCurrentGame: false });
    }
  });

  it('a running game: judge, roles and seats until its protocol is completed, also in correction', () => {
    for (const status of ['active', 'correction']) {
      expect(rights(status, game('g1', 'active', 'draft'))).toMatchObject({ canEditCurrentGameJudgeAndRoles: true, canEditJudgeInline: true, canSwapSeatsCurrentGame: true, canCorrectCurrentGame: false });
    }
    expect(rights('active', game('g1', 'active', 'completed'))).toMatchObject({ canEditCurrentGameJudgeAndRoles: false, canSwapSeatsCurrentGame: false, canCorrectCurrentGame: true });
  });

  it('another running game blocks nothing; the setup screen still learns which game runs', () => {
    const r = tournamentGameEditRights('correction', [game('g1', 'active', 'draft'), game('g2', 'active', 'draft')], game('g1', 'active', 'draft'));
    expect(r).toMatchObject({ isAnotherGameActive: true, canEditCurrentGameJudgeAndRoles: true, canSwapSeatsCurrentGame: true, canEditJudgeInline: true });
    expect(r.activeGameInTournament?.id).toBe('g2');
  });

  it('a completed game: the judge at once, «Исправить» for the rest — also in a completed tournament', () => {
    expect(rights('active', game('g1', 'completed', 'completed'))).toMatchObject({ canEditCurrentGameJudgeAndRoles: false, canEditJudgeInline: true, canSwapSeatsCurrentGame: false, canCorrectCurrentGame: true });
    expect(rights('completed', game('g1', 'completed', 'completed'))).toMatchObject({ canEditCurrentGameJudgeAndRoles: false, canEditJudgeInline: false, canCorrectCurrentGame: true });
  });

  it('nothing without a selected game', () => {
    const none = tournamentGameEditRights('active', [], undefined);
    expect(none).toMatchObject({ canEditCurrentGameJudgeAndRoles: false, canEditJudgeInline: false, canSwapSeatsCurrentGame: false, canCorrectCurrentGame: false, isAnotherGameActive: false });
    expect(none.roleCounts).toEqual({ citizen: 0, sheriff: 0, mafia: 0, don: 0 });
  });
});
