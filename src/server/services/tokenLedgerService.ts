import crypto from 'crypto';
import type { DatabaseWrapper } from '../../db/index.ts';

export type TokenDebitPolicy = 'prevent_negative' | 'allow_negative';

export interface TokenMutationInput {
  playerId: string;
  delta: number;
  reasonType: string;
  description: string;
  sourceType: string;
  sourceId?: string | null;
  idempotencyKey: string;
  debitPolicy?: TokenDebitPolicy;
  actorType?: string | null;
  actorId?: string | null;
  metadata?: unknown;
}

export interface TokenLedgerEntry {
  id: string;
  player_id: string;
  amount: number;
  balance_after: number;
  reason_type: string;
  description: string;
  source_type: string;
  source_id: string | null;
  idempotency_key: string;
  payload_hash: string;
  actor_type: string | null;
  actor_id: string | null;
  metadata_json: string | null;
  created_at: string;
}

export class TokenValidationError extends Error {}
export class TokenInsufficientFundsError extends Error {}
export class TokenIdempotencyConflictError extends Error {}
export class TokenPlayerNotFoundError extends Error {}

const mutationTails = new WeakMap<object, Promise<void>>();

const canonicalize = (value: any): any => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = canonicalize(value[key]);
        return acc;
      }, {} as Record<string, any>);
  }
  return value;
};

const metadataToJson = (metadata: unknown): string | null => {
  if (metadata === undefined || metadata === null) return null;
  return JSON.stringify(canonicalize(metadata));
};

const payloadForHash = (input: TokenMutationInput) => ({
  playerId: input.playerId,
  delta: input.delta,
  reasonType: input.reasonType.trim(),
  description: input.description.trim(),
  sourceType: input.sourceType.trim(),
  sourceId: input.sourceId ?? null,
  debitPolicy: input.debitPolicy || 'prevent_negative',
  actorType: input.actorType ?? null,
  actorId: input.actorId ?? null,
  metadataJson: metadataToJson(input.metadata),
});

const hashPayload = (input: TokenMutationInput) => crypto
  .createHash('sha256')
  .update(JSON.stringify(payloadForHash(input)))
  .digest('hex');

const assertMutation = (input: TokenMutationInput) => {
  if (!input.playerId?.trim()) throw new TokenValidationError('playerId is required');
  if (!Number.isInteger(input.delta) || input.delta === 0) {
    throw new TokenValidationError('Token delta must be a non-zero integer');
  }
  if (!input.reasonType?.trim()) throw new TokenValidationError('Token reason type is required');
  if (!input.description?.trim()) throw new TokenValidationError('Token description is required');
  if (!input.sourceType?.trim()) throw new TokenValidationError('Token source type is required');
  if (!input.idempotencyKey?.trim()) throw new TokenValidationError('Token idempotency key is required');
};

const serialized = async <T>(db: DatabaseWrapper, work: () => Promise<T>): Promise<T> => {
  const previous = mutationTails.get(db) || Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.then(() => gate);
  mutationTails.set(db, tail);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (mutationTails.get(db) === tail) mutationTails.delete(db);
  }
};

const loadEntryByKey = async (db: DatabaseWrapper, key: string) => db.get<TokenLedgerEntry>(
  'SELECT * FROM token_ledger WHERE idempotency_key = ?',
  [key],
);

const applyInsideTransaction = async (db: DatabaseWrapper, input: TokenMutationInput): Promise<TokenLedgerEntry> => {
  assertMutation(input);
  const payloadHash = hashPayload(input);
  const existing = await loadEntryByKey(db, input.idempotencyKey.trim());
  if (existing) {
    if (existing.payload_hash !== payloadHash) {
      throw new TokenIdempotencyConflictError('Idempotency key was already used with different token data');
    }
    return existing;
  }

  const player = await db.get<{ id: string; tokens: number }>('SELECT id, tokens FROM players WHERE id = ?', [input.playerId]);
  if (!player) throw new TokenPlayerNotFoundError('Player not found');
  if (!Number.isInteger(player.tokens)) throw new TokenValidationError('Stored token balance is not an integer');

  const nextBalance = player.tokens + input.delta;
  if (!Number.isSafeInteger(nextBalance)) throw new TokenValidationError('Resulting token balance is outside safe integer range');
  if ((input.debitPolicy || 'prevent_negative') === 'prevent_negative' && nextBalance < 0) {
    throw new TokenInsufficientFundsError('Insufficient token balance');
  }

  const entry: TokenLedgerEntry = {
    id: `tok_${crypto.randomUUID()}`,
    player_id: player.id,
    amount: input.delta,
    balance_after: nextBalance,
    reason_type: input.reasonType.trim(),
    description: input.description.trim(),
    source_type: input.sourceType.trim(),
    source_id: input.sourceId ?? null,
    idempotency_key: input.idempotencyKey.trim(),
    payload_hash: payloadHash,
    actor_type: input.actorType ?? null,
    actor_id: input.actorId ?? null,
    metadata_json: metadataToJson(input.metadata),
    created_at: new Date().toISOString(),
  };

  await db.run(
    `INSERT INTO token_ledger (
       id, player_id, amount, balance_after, reason_type, description,
       source_type, source_id, idempotency_key, payload_hash,
       actor_type, actor_id, metadata_json, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.id, entry.player_id, entry.amount, entry.balance_after,
      entry.reason_type, entry.description, entry.source_type, entry.source_id,
      entry.idempotency_key, entry.payload_hash, entry.actor_type, entry.actor_id,
      entry.metadata_json, entry.created_at,
    ],
  );
  await db.run(
    'UPDATE players SET tokens = ?, updated_at = ? WHERE id = ?',
    [entry.balance_after, entry.created_at, entry.player_id],
  );
  return entry;
};

export const mutateTokenBalance = async (db: DatabaseWrapper, input: TokenMutationInput): Promise<TokenLedgerEntry> => {
  assertMutation(input);

  // Local better-sqlite3 exposes transaction state directly. The production
  // Turso HTTP wrapper intentionally has no native sqlite object, so optional
  // chaining is required here instead of reading sqlite.inTransaction blindly.
  if ((db.sqlite as any)?.inTransaction) return applyInsideTransaction(db, input);

  return serialized(db, async () => {
    try {
      return await db.transaction((tx) => applyInsideTransaction(tx, input));
    } catch (error) {
      // Club-game completion already runs token settlement inside one outer
      // transaction. A Turso transaction wrapper rejects a nested transaction
      // before executing the callback; in that exact case, continue on the
      // current transaction wrapper instead of opening another transaction.
      if (
        !(db.sqlite as any)
        && error instanceof Error
        && error.message === 'Nested Turso transactions are not supported'
      ) {
        return applyInsideTransaction(db, input);
      }
      throw error;
    }
  });
};

export const reconcileTokenOpeningBalances = async (db: DatabaseWrapper): Promise<number> => {
  const players = await db.all<{ id: string; tokens: number; created_at: string | null }>(
    'SELECT id, tokens, created_at FROM players ORDER BY id',
  );
  let inserted = 0;

  await db.transaction(async (tx) => {
    for (const player of players) {
      if (!Number.isInteger(player.tokens)) throw new TokenValidationError(`Non-integer token balance for player ${player.id}`);
      const history = await tx.get<{ count: number }>('SELECT COUNT(*) AS count FROM token_ledger WHERE player_id = ?', [player.id]);
      if (Number(history?.count || 0) > 0 || player.tokens === 0) continue;

      const input: TokenMutationInput = {
        playerId: player.id,
        delta: player.tokens,
        reasonType: 'opening_balance',
        description: 'Начальный баланс при миграции канонического журнала жетонов',
        sourceType: 'migration',
        sourceId: '0009_token_ledger',
        idempotencyKey: `token-opening:${player.id}`,
        debitPolicy: 'allow_negative',
        actorType: 'system',
        actorId: null,
        metadata: { migration: '0009_token_ledger' },
      };
      const payloadHash = hashPayload(input);
      const createdAt = player.created_at || new Date().toISOString();
      await tx.run(
        `INSERT INTO token_ledger (
           id, player_id, amount, balance_after, reason_type, description,
           source_type, source_id, idempotency_key, payload_hash,
           actor_type, actor_id, metadata_json, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `tok_open_${player.id}`,
          player.id,
          player.tokens,
          player.tokens,
          input.reasonType,
          input.description,
          input.sourceType,
          input.sourceId,
          input.idempotencyKey,
          payloadHash,
          input.actorType,
          input.actorId,
          metadataToJson(input.metadata),
          createdAt,
        ],
      );
      inserted += 1;
    }
  });

  return inserted;
};

export const getTokenLedgerPage = async (db: DatabaseWrapper, playerId: string, limit = 20, offset = 0) => {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const safeOffset = Math.max(0, Math.trunc(offset));
  const player = await db.get<{ id: string; tokens: number }>('SELECT id, tokens FROM players WHERE id = ?', [playerId]);
  if (!player) throw new TokenPlayerNotFoundError('Player not found');
  const totalRow = await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM token_ledger WHERE player_id = ?', [playerId]);
  const items = await db.all<TokenLedgerEntry>(
    'SELECT * FROM token_ledger WHERE player_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?',
    [playerId, safeLimit, safeOffset],
  );
  return {
    player_id: player.id,
    balance: player.tokens,
    ledger: { items, total: Number(totalRow?.count || 0), limit: safeLimit, offset: safeOffset },
  };
};

export const verifyTokenLedgerConsistency = async (db: DatabaseWrapper) => {
  const rows = await db.all<{ id: string; tokens: number; ledger_total: number }>(`
    SELECT p.id, p.tokens, COALESCE(SUM(tl.amount), 0) AS ledger_total
      FROM players p
 LEFT JOIN token_ledger tl ON tl.player_id = p.id
  GROUP BY p.id, p.tokens
  ORDER BY p.id
  `);
  return rows.map((row) => ({ ...row, matches: row.tokens === Number(row.ledger_total) }));
};
