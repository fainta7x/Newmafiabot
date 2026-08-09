import fs from 'fs';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection } from '../db/index.ts';
import { getPreviewRecoveryDir } from '../db/previewRecovery.ts';
import { initializePreviewRuntimeFromCanonical, stampRepositorySnapshot } from '../db/canonicalSnapshot.ts';
import { CURRENT_TOURNAMENT_AVATAR_ASSETS, resolveRepositoryPlayerAvatarPath } from '../lib/playerAvatarManifest.ts';

const roots: string[] = [];
const makeRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'newmafia-canonical-test-'));
  roots.push(root);
  fs.copyFileSync(path.join(process.cwd(), 'mafia_crm.checkpoint.sqlite.gz.b64'), path.join(root, 'mafia_crm.checkpoint.sqlite.gz.b64'));
  fs.copyFileSync(path.join(process.cwd(), 'mafia_crm.checkpoint.meta.json'), path.join(root, 'mafia_crm.checkpoint.meta.json'));
  return root;
};

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('canonical Preview snapshot bootstrap', () => {
  it('initializes an absent runtime from the current canonical tournament snapshot', () => {
    const root = makeRoot();
    const runtime = path.join(root, 'runtime.sqlite');
    const result = initializePreviewRuntimeFromCanonical(runtime, root, { allowLegacyWithoutCanonical: false });
    expect(result).toEqual({ initialized: true, source: 'canonical' });
    const db = new Database(runtime, { readonly: true });
    const tournament = db.prepare('SELECT title, status FROM tournaments WHERE id = ?').get('987670b4-afd7-48d1-92ce-3d4d4cbed8d6') as any;
    expect(tournament).toEqual({ title: 'Турнир Богдана 1.08', status: 'completed' });
    expect((db.prepare("SELECT COUNT(*) count FROM tournament_games WHERE tournament_id = ? AND status = 'completed'").get('987670b4-afd7-48d1-92ce-3d4d4cbed8d6') as any).count).toBe(10);
    const participantPlayerIds = new Set((db.prepare('SELECT player_id FROM tournament_participants WHERE tournament_id = ?').all('987670b4-afd7-48d1-92ce-3d4d4cbed8d6') as any[]).map((row) => row.player_id));
    for (const asset of CURRENT_TOURNAMENT_AVATAR_ASSETS) {
      expect(participantPlayerIds.has(asset.player_id)).toBe(true);
      const avatarPath = resolveRepositoryPlayerAvatarPath(asset.player_id, process.cwd());
      expect(avatarPath).toBeTruthy();
      const hash = createHash('sha256').update(fs.readFileSync(avatarPath!)).digest('hex');
      expect(hash).toBe(asset.sha256);
    }
    db.close();
  });

  it('preserves a runtime mutation across restart instead of reimporting the snapshot', () => {
    const root = makeRoot();
    const runtime = path.join(root, 'runtime.sqlite');
    initializePreviewRuntimeFromCanonical(runtime, root, { allowLegacyWithoutCanonical: false });
    const db = new Database(runtime);
    db.prepare('UPDATE tournaments SET venue = ? WHERE id = ?').run('Проверка сохранения', '987670b4-afd7-48d1-92ce-3d4d4cbed8d6');
    db.close();
    expect(initializePreviewRuntimeFromCanonical(runtime, root, { allowLegacyWithoutCanonical: false })).toEqual({ initialized: false, source: 'existing' });
    const restarted = new Database(runtime, { readonly: true });
    expect((restarted.prepare('SELECT venue FROM tournaments WHERE id = ?').get('987670b4-afd7-48d1-92ce-3d4d4cbed8d6') as any).venue).toBe('Проверка сохранения');
    restarted.close();
  });

  it('ignores a stale namespaced Preview checkpoint when a newer canonical version exists', () => {
    const root = makeRoot();
    const runtime = path.join(root, 'runtime.sqlite');
    const recoveryDir = getPreviewRecoveryDir(runtime);
    fs.mkdirSync(recoveryDir, { recursive: true });
    const stale = path.join(recoveryDir, 'latest.sqlite');
    const sourceRuntime = path.join(root, 'source.sqlite');
    initializePreviewRuntimeFromCanonical(sourceRuntime, root, { allowLegacyWithoutCanonical: false });
    fs.copyFileSync(sourceRuntime, stale);
    stampRepositorySnapshot(stale, 'obsolete-preview-v0');
    const staleDb = new Database(stale);
    staleDb.prepare('UPDATE tournaments SET title = ? WHERE id = ?').run('СТАРЫЙ ТУРНИР', '987670b4-afd7-48d1-92ce-3d4d4cbed8d6');
    staleDb.close();

    const result = initializePreviewRuntimeFromCanonical(runtime, root, { allowLegacyWithoutCanonical: false });
    expect(result.source).toBe('canonical');
    const restored = new Database(runtime, { readonly: true });
    expect((restored.prepare('SELECT title FROM tournaments WHERE id = ?').get('987670b4-afd7-48d1-92ce-3d4d4cbed8d6') as any).title).toBe('Турнир Богдана 1.08');
    restored.close();
  });

  it('schema initialization migrates an existing database without reimporting tournament data', () => {
    const root = makeRoot();
    const runtime = path.join(root, 'runtime.sqlite');
    initializePreviewRuntimeFromCanonical(runtime, root, { allowLegacyWithoutCanonical: false });
    const raw = new Database(runtime);
    raw.prepare('UPDATE tournaments SET notes = ? WHERE id = ?').run('runtime mutation survives migration', '987670b4-afd7-48d1-92ce-3d4d4cbed8d6');
    raw.close();
    const wrapper = createDatabaseConnection(runtime);
    const notes = wrapper.sqlite.prepare('SELECT notes FROM tournaments WHERE id = ?').get('987670b4-afd7-48d1-92ce-3d4d4cbed8d6') as any;
    expect(notes.notes).toBe('runtime mutation survives migration');
    expect(wrapper.sqlite.prepare("SELECT COUNT(*) count FROM tournament_final_resolutions WHERE type = 'nomination_tie'").get()).toEqual({ count: 0 });
    wrapper.sqlite.close();
  });
});
