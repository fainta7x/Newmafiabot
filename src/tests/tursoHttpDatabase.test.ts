import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTursoHttpDatabase } from '../db/tursoHttpDatabase.ts';

const jsonResponse = (payload: unknown) => new Response(JSON.stringify(payload), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});

const executeResult = (rows: unknown[][] = [], columns: string[] = []) => ({
  type: 'ok',
  response: {
    type: 'execute',
    result: {
      cols: columns.map((name) => ({ name })),
      rows,
      affected_row_count: 0,
      last_insert_rowid: null,
    },
  },
});

afterEach(() => vi.restoreAllMocks());

describe('Turso HTTP session isolation', () => {
  it('does not leak an exec transaction baton into a concurrent query', async () => {
    let releaseExecBatch: ((response: Response) => void) | null = null;
    const calls: Array<{ url: string; body: any }> = [];

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body || '{}'));
      calls.push({ url, body });
      const sql = String(body?.requests?.[0]?.stmt?.sql || '');

      if (sql === 'BEGIN IMMEDIATE') {
        return jsonResponse({
          baton: 'exec-baton-1',
          base_url: 'https://routed.example/',
          results: [executeResult()],
        });
      }
      if (sql === 'CREATE TABLE one (id INTEGER)') {
        return new Promise<Response>((resolve) => { releaseExecBatch = resolve; });
      }
      if (sql === 'SELECT 42 AS value') {
        return jsonResponse({
          baton: null,
          results: [
            executeResult([[{ type: 'integer', value: '42' }]], ['value']),
            { type: 'ok', response: { type: 'close' } },
          ],
        });
      }
      if (sql === 'COMMIT') {
        return jsonResponse({
          baton: null,
          results: [executeResult(), { type: 'ok', response: { type: 'close' } }],
        });
      }
      throw new Error(`Unexpected Turso request: ${sql}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { wrapper } = createTursoHttpDatabase('libsql://database.example', 'token');
    const execPromise = wrapper.exec('CREATE TABLE one (id INTEGER); CREATE TABLE two (id INTEGER);');
    await vi.waitFor(() => expect(releaseExecBatch).not.toBeNull());

    const row = await wrapper.get<{ value: number }>('SELECT 42 AS value');
    expect(row).toEqual({ value: 42 });

    const queryCall = calls.find((call) => call.body?.requests?.[0]?.stmt?.sql === 'SELECT 42 AS value');
    expect(queryCall?.body?.baton).toBeUndefined();
    expect(queryCall?.url).toBe('https://database.example/v2/pipeline');

    releaseExecBatch!(jsonResponse({
      baton: 'exec-baton-2',
      base_url: 'https://routed.example/',
      results: [executeResult(), executeResult()],
    }));
    await execPromise;
  });
});
