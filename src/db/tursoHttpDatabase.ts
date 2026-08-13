import Database from 'better-sqlite3';

type SqlStatement = { sql: string; args?: any[] };
type EncodedValue =
  | { type: 'null' }
  | { type: 'integer'; value: string }
  | { type: 'float'; value: number }
  | { type: 'text'; value: string }
  | { type: 'blob'; base64: string };

type PipelineResult = {
  baton?: string | null;
  base_url?: string | null;
  results?: any[];
};

export interface TursoCompatibleWrapper {
  sqlite: any;
  drizzle: any;
  all<T = any>(sql: string, params?: any[]): Promise<T[]>;
  get<T = any>(sql: string, params?: any[]): Promise<T | null>;
  run(sql: string, params?: any[]): Promise<{ lastID: number | bigint | null; changes: number }>;
  exec(sql: string): Promise<void>;
  transaction<T>(cb: (tx: TursoCompatibleWrapper) => Promise<T>): Promise<T>;
  dbPath: string;
}

const quoteIdent = (value: string) => `"${value.replace(/"/g, '""')}"`;

function normalizeHttpBaseUrl(databaseUrl: string): string {
  const trimmed = databaseUrl.trim().replace(/\/+$/, '');
  if (trimmed.startsWith('libsql://')) return `https://${trimmed.slice('libsql://'.length)}`;
  if (trimmed.startsWith('turso://')) return `https://${trimmed.slice('turso://'.length)}`;
  if (trimmed.startsWith('https://')) return trimmed;
  throw new Error('TURSO_DATABASE_URL must use libsql://, turso:// or https://');
}

function encodeValue(value: any): EncodedValue {
  if (value === null || value === undefined) return { type: 'null' };
  if (typeof value === 'boolean') return { type: 'integer', value: value ? '1' : '0' };
  if (typeof value === 'bigint') return { type: 'integer', value: value.toString() };
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Cannot bind a non-finite number to Turso');
    return Number.isInteger(value)
      ? { type: 'integer', value: String(value) }
      : { type: 'float', value };
  }
  if (Buffer.isBuffer(value)) return { type: 'blob', base64: value.toString('base64') };
  if (value instanceof Uint8Array) return { type: 'blob', base64: Buffer.from(value).toString('base64') };
  return { type: 'text', value: String(value) };
}

function decodeValue(value: any): any {
  if (!value || value.type === 'null') return null;
  if (value.type === 'text') return String(value.value ?? '');
  if (value.type === 'float') return Number(value.value);
  if (value.type === 'blob') return Buffer.from(String(value.base64 || ''), 'base64');
  if (value.type === 'integer') {
    const parsed = BigInt(String(value.value ?? '0'));
    return parsed <= BigInt(Number.MAX_SAFE_INTEGER) && parsed >= BigInt(Number.MIN_SAFE_INTEGER)
      ? Number(parsed)
      : parsed;
  }
  return value.value ?? null;
}

function statementRequest(statement: SqlStatement) {
  return {
    type: 'execute',
    stmt: {
      sql: statement.sql,
      ...(statement.args?.length ? { args: statement.args.map(encodeValue) } : {}),
    },
  };
}

function extractExecuteResult(result: any) {
  if (!result || result.type !== 'ok' || result.response?.type !== 'execute') {
    throw new Error(result?.error?.message || result?.response?.error?.message || 'Turso query failed');
  }
  return result.response.result || {};
}

function resultRows(result: any): Record<string, any>[] {
  const execute = extractExecuteResult(result);
  const columns = (execute.cols || []).map((column: any) => String(column?.name || ''));
  return (execute.rows || []).map((row: any[]) => {
    const out: Record<string, any> = {};
    columns.forEach((column: string, index: number) => { out[column] = decodeValue(row[index]); });
    return out;
  });
}

// exec() compatibility for the few callers that provide SQL scripts.
function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let quote: string | null = null;
  let lineComment = false;
  let blockComment = false;

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (lineComment) {
      current += ch;
      if (ch === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      current += ch;
      if (ch === '*' && next === '/') {
        current += next;
        i += 1;
        blockComment = false;
      }
      continue;
    }
    if (quote) {
      current += ch;
      if (ch === quote) {
        if (next === quote && quote !== ']') {
          current += next;
          i += 1;
        } else quote = null;
      }
      continue;
    }
    if (ch === '-' && next === '-') {
      current += ch + next;
      i += 1;
      lineComment = true;
      continue;
    }
    if (ch === '/' && next === '*') {
      current += ch + next;
      i += 1;
      blockComment = true;
      continue;
    }
    if (ch === '\'' || ch === '"' || ch === '`') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '[') {
      quote = ']';
      current += ch;
      continue;
    }
    if (ch === ';') {
      if (current.trim()) statements.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

class TursoHttpSession {
  private readonly defaultBaseUrl: string;
  private readonly authToken: string;
  private baton: string | null = null;
  private routedBaseUrl: string | null = null;

  constructor(databaseUrl: string, authToken: string) {
    this.defaultBaseUrl = normalizeHttpBaseUrl(databaseUrl);
    this.authToken = authToken;
  }

  private endpoint() {
    return `${(this.routedBaseUrl || this.defaultBaseUrl).replace(/\/+$/, '')}/v2/pipeline`;
  }

  async pipeline(requests: any[], options: { keepOpen?: boolean; allowErrors?: boolean } = {}): Promise<PipelineResult> {
    const payload: any = { requests };
    if (this.baton) payload.baton = this.baton;
    const response = await fetch(this.endpoint(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Turso HTTP ${response.status}: ${text || response.statusText}`);
    }
    const data = await response.json() as PipelineResult;
    this.baton = data.baton || null;
    if (data.base_url) this.routedBaseUrl = data.base_url;
    const results = Array.isArray(data.results) ? data.results : [];
    if (!options.allowErrors) {
      const failed = results.find((result: any) => result?.type === 'error');
      if (failed) throw new Error(failed?.error?.message || 'Turso query failed');
    }
    if (!options.keepOpen) {
      this.baton = null;
      this.routedBaseUrl = null;
    }
    return data;
  }

  async execute(statement: SqlStatement, keepOpen = false) {
    const requests: any[] = [statementRequest(statement)];
    if (!keepOpen) requests.push({ type: 'close' });
    const data = await this.pipeline(requests, { keepOpen });
    return extractExecuteResult(data.results?.[0]);
  }

  async begin() {
    const data = await this.pipeline([statementRequest({ sql: 'BEGIN IMMEDIATE' })], { keepOpen: true });
    extractExecuteResult(data.results?.[0]);
    if (!this.baton) throw new Error('Turso did not return a transaction baton');
  }

  async commit() {
    if (!this.baton) return;
    const data = await this.pipeline([statementRequest({ sql: 'COMMIT' }), { type: 'close' }]);
    extractExecuteResult(data.results?.[0]);
  }

  async rollback() {
    if (!this.baton) return;
    try {
      await this.pipeline([statementRequest({ sql: 'ROLLBACK' }), { type: 'close' }], { allowErrors: true });
    } finally {
      this.baton = null;
      this.routedBaseUrl = null;
    }
  }

  async atomicBatch(statements: SqlStatement[]) {
    if (!statements.length) return;
    await this.begin();
    try {
      const data = await this.pipeline(statements.map(statementRequest), { keepOpen: true, allowErrors: true });
      const failed = (data.results || []).find((result: any) => result?.type === 'error');
      if (failed) throw new Error(failed?.error?.message || 'Turso atomic batch failed');
      await this.commit();
    } catch (error) {
      await this.rollback();
      throw error;
    }
  }
}

function createWrapper(
  databaseUrl: string,
  authToken: string,
  dbPath: string,
  session: TursoHttpSession,
  transactional: boolean,
): TursoCompatibleWrapper {
  const wrapper: TursoCompatibleWrapper = {
    // Structural compatibility only. Server routes use all/get/run/transaction, not the local driver directly.
    sqlite: undefined,
    drizzle: undefined,
    dbPath,
    async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
      const requests: any[] = [statementRequest({ sql, args: params })];
      if (!transactional) requests.push({ type: 'close' });
      const data = await session.pipeline(requests, { keepOpen: transactional });
      return resultRows(data.results?.[0]) as T[];
    },
    async get<T = any>(sql: string, params: any[] = []): Promise<T | null> {
      const rows = await wrapper.all<T>(sql, params);
      return rows[0] ?? null;
    },
    async run(sql: string, params: any[] = []) {
      const execute = await session.execute({ sql, args: params }, transactional);
      const rawId = execute.last_insert_rowid;
      let lastID: number | bigint | null = null;
      if (rawId !== null && rawId !== undefined && rawId !== '') {
        const parsed = BigInt(String(rawId));
        lastID = parsed <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(parsed) : parsed;
      }
      return { lastID, changes: Number(execute.affected_row_count || 0) };
    },
    async exec(sql: string) {
      const statements = splitSqlStatements(sql).map((part) => ({ sql: part }));
      if (!statements.length) return;
      if (!transactional) {
        // An atomic batch keeps a Hrana baton alive across several HTTP calls.
        // Never put that baton on the shared query session: a concurrent request
        // could otherwise reuse/close the stream and Turso responds with
        // `404 stream not found`. Transactions already use an isolated session;
        // exec() must do the same.
        const execSession = new TursoHttpSession(databaseUrl, authToken);
        await execSession.atomicBatch(statements);
        return;
      }
      const data = await session.pipeline(statements.map(statementRequest), { keepOpen: true });
      for (const result of data.results || []) extractExecuteResult(result);
    },
    async transaction<T>(cb: (tx: TursoCompatibleWrapper) => Promise<T>): Promise<T> {
      if (transactional) throw new Error('Nested Turso transactions are not supported');
      const txSession = new TursoHttpSession(databaseUrl, authToken);
      await txSession.begin();
      const txWrapper = createWrapper(databaseUrl, authToken, dbPath, txSession, true);
      try {
        const result = await cb(txWrapper);
        await txSession.commit();
        return result;
      } catch (error) {
        await txSession.rollback();
        throw error;
      }
    },
  };
  return wrapper;
}

export function createTursoHttpDatabase(databaseUrl: string, authToken: string) {
  if (!databaseUrl.trim() || !authToken.trim()) throw new Error('Turso credentials are incomplete');
  const dbPath = `turso:${normalizeHttpBaseUrl(databaseUrl).replace(/^https:\/\//, '')}`;
  const session = new TursoHttpSession(databaseUrl, authToken);
  const wrapper = createWrapper(databaseUrl, authToken, dbPath, session, false);

  return {
    wrapper,
    async isEmpty(): Promise<boolean> {
      const row = await wrapper.get<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' LIMIT 1",
      );
      return !row;
    },
    async importFromSqlite(source: Database.Database): Promise<void> {
      const objects = source.prepare(`
        SELECT type, name, tbl_name, sql
        FROM sqlite_master
        WHERE sql IS NOT NULL
          AND name NOT LIKE 'sqlite_%'
          AND type IN ('table', 'index', 'trigger', 'view')
        ORDER BY rowid ASC
      `).all() as Array<{ type: string; name: string; tbl_name: string; sql: string }>;

      const tables = objects.filter((item) => item.type === 'table');
      const tableNames = new Set(tables.map((table) => table.name));
      const dependencies = new Map<string, Set<string>>();
      for (const table of tables) {
        const foreignKeys = source.prepare(`PRAGMA foreign_key_list(${quoteIdent(table.name)})`).all() as Array<{ table?: string }>;
        dependencies.set(
          table.name,
          new Set(foreignKeys.map((fk) => String(fk.table || '')).filter((name) => tableNames.has(name) && name !== table.name)),
        );
      }

      const remaining = new Set(tables.map((table) => table.name));
      const insertionOrder: string[] = [];
      while (remaining.size) {
        const ready = [...remaining].filter((name) =>
          [...(dependencies.get(name) || [])].every((dependency) => !remaining.has(dependency)),
        );
        if (!ready.length) {
          insertionOrder.push(...[...remaining].sort());
          break;
        }
        ready.sort();
        for (const name of ready) {
          remaining.delete(name);
          insertionOrder.push(name);
        }
      }

      const statements: SqlStatement[] = tables.map((table) => ({ sql: table.sql }));
      for (const tableName of insertionOrder) {
        const columns = (source.prepare(`PRAGMA table_info(${quoteIdent(tableName)})`).all() as Array<{ name: string }>).map((column) => column.name);
        if (!columns.length) continue;
        const rows = source.prepare(`SELECT * FROM ${quoteIdent(tableName)}`).all() as Record<string, any>[];
        const columnSql = columns.map(quoteIdent).join(', ');
        const placeholders = columns.map(() => '?').join(', ');
        for (const row of rows) {
          statements.push({
            sql: `INSERT INTO ${quoteIdent(tableName)} (${columnSql}) VALUES (${placeholders})`,
            args: columns.map((column) => row[column]),
          });
        }
      }

      for (const object of objects.filter((item) => item.type !== 'table')) statements.push({ sql: object.sql });
      if (!statements.length) throw new Error('Canonical SQLite source contains no schema to import');

      console.log(`[TURSO] Importing canonical database atomically (${tables.length} tables, ${statements.length} statements)...`);
      await session.atomicBatch(statements);

      const sourcePlayers = Number((source.prepare('SELECT COUNT(*) AS count FROM players').get() as any)?.count || 0);
      const remotePlayers = Number((await wrapper.get<any>('SELECT COUNT(*) AS count FROM players'))?.count || 0);
      if (sourcePlayers !== remotePlayers || remotePlayers === 0) {
        throw new Error(`Turso bootstrap verification failed for players (${remotePlayers}/${sourcePlayers})`);
      }
      const sourceMigrations = Number((source.prepare('SELECT COUNT(*) AS count FROM migration_history').get() as any)?.count || 0);
      const remoteMigrations = Number((await wrapper.get<any>('SELECT COUNT(*) AS count FROM migration_history'))?.count || 0);
      if (sourceMigrations !== remoteMigrations) {
        throw new Error(`Turso bootstrap verification failed for migrations (${remoteMigrations}/${sourceMigrations})`);
      }
    },
  };
}
