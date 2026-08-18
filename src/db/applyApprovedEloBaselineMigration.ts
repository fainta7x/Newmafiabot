import type { DatabaseWrapper } from './index.ts';

const MIGRATION_KEY = '0014_apply_approved_elo1_baseline_v1';

const APPROVED_ELO = [
  ['Матроскина', 1053],
  ['Денди', 1027],
  ['Фандорин', 1012],
  ['Пристань', 1012],
  ['Богданчик', 1004],
  ['Джава', 1003],
  ['Знак', 1003],
  ['Спящий', 1002],
  ['Насон', 996],
  ['Вид', 988],
] as const;

export function applyApprovedEloBaselineMigration(db: DatabaseWrapper): void {
  if (db.dbPath === ':memory:') return;

  const existing = db.sqlite
    .prepare('SELECT status FROM migration_history WHERE migration_name = ? LIMIT 1')
    .get(MIGRATION_KEY) as { status?: string } | undefined;

  if (existing?.status === 'completed') return;
  if (existing) throw new Error('Approved ELO1 baseline migration has an unexpected existing status.');

  db.sqlite.transaction(() => {
    const findByNickname = db.sqlite.prepare('SELECT id FROM players WHERE nickname = ? LIMIT 2');
    const updateElo = db.sqlite.prepare('UPDATE players SET elo = ? WHERE id = ?');
    const now = new Date().toISOString();

    for (const [nickname, elo] of APPROVED_ELO) {
      const matches = findByNickname.all(nickname) as Array<{ id: string }>;
      if (matches.length !== 1) {
        throw new Error(`Approved ELO1 baseline migration requires exactly one player with nickname "${nickname}".`);
      }
      updateElo.run(elo, matches[0].id);
    }

    db.sqlite.prepare(
      'INSERT INTO migration_history (id, migration_name, status, details_json, executed_at) VALUES (?, ?, ?, ?, ?)'
    ).run(
      MIGRATION_KEY,
      MIGRATION_KEY,
      'completed',
      JSON.stringify({ players_updated: APPROVED_ELO.length }),
      now,
    );
  })();
}
