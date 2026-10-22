import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureTournamentEveningSchema } from '../db/ensureTournamentEveningSchema.ts';
import { recordTournamentGameEdit, tournamentGameEditPermission } from '../server/services/tournamentGameEditPolicy.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

async function setup(protocolStatus: string | null) {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  if (protocolStatus) {
    // Only the protocol status matters to the rule; the game row itself is not needed here.
    db.sqlite.pragma('foreign_keys = OFF');
    const now = new Date().toISOString();
    await db.run("INSERT INTO tournament_game_protocols (id, game_id, status, created_at, updated_at) VALUES ('pr1', 'g1', ?, ?, ?)", [protocolStatus, now, now]);
  }
  return db;
}

const allowed = async (db: DatabaseWrapper, tournament: string, game: string, kind: 'judge' | 'roles' | 'seats') =>
  (await tournamentGameEditPermission(db, { status: tournament }, { id: 'g1', status: game }, kind)).allowed;

describe('what an organizer may change in a tournament game (owner, 2026-10-22)', () => {
  it('a game that has not started: everything, in a draft, running or reopened tournament', async () => {
    const db = await setup(null);
    for (const tournament of ['draft', 'active', 'correction']) {
      for (const kind of ['judge', 'roles', 'seats'] as const) expect(await allowed(db, tournament, 'planned', kind)).toBe(true);
    }
  });

  it('a running game: everything until its protocol is completed', async () => {
    const draft = await setup('draft');
    for (const tournament of ['active', 'correction']) {
      for (const kind of ['judge', 'roles', 'seats'] as const) expect(await allowed(draft, tournament, 'active', kind)).toBe(true);
    }
    const closed = await setup('completed');
    for (const kind of ['judge', 'roles', 'seats'] as const) expect(await allowed(closed, 'active', 'active', kind)).toBe(false);
  });

  it('a completed game: the judge at once, roles and seats after «Исправить»', async () => {
    const db = await setup('completed');
    expect(await allowed(db, 'active', 'completed', 'judge')).toBe(true);
    expect(await allowed(db, 'correction', 'completed', 'judge')).toBe(true);
    const roles = await tournamentGameEditPermission(db, { status: 'active' }, { id: 'g1', status: 'completed' }, 'roles');
    expect(roles.allowed).toBe(false);
    expect(roles.error).toContain('«Исправить»');
    expect(await allowed(db, 'active', 'completed', 'seats')).toBe(false);
  });

  it('a completed tournament: nothing until «Исправить» reopens it', async () => {
    const db = await setup('draft');
    const result = await tournamentGameEditPermission(db, { status: 'completed' }, { id: 'g1', status: 'planned' }, 'judge');
    expect(result.allowed).toBe(false);
    expect(result.error).toContain('«Исправить»');
  });

  it('keeps every correction in the tournament history', async () => {
    const db = await setup(null);
    await ensureTournamentEveningSchema(db);
    await recordTournamentGameEdit(db, { tournamentId: 't1', gameId: 'g1', action: 'game_roles_changed', actorId: 'org-1', payload: { roles: [] } });
    const row = await db.get<any>('SELECT tournament_id, action, actor_id, payload_json FROM tournament_evening_audit');
    expect(row).toMatchObject({ tournament_id: 't1', action: 'game_roles_changed', actor_id: 'org-1' });
    expect(JSON.parse(row.payload_json)).toEqual({ game_id: 'g1', roles: [] });
  });
});
