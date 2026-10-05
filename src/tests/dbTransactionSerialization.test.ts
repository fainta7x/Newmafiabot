import { describe, expect, it } from 'vitest';
import { createDatabaseConnection } from '../db/index';

const pause = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

describe('db.transaction on the single SQLite connection', () => {
  it('runs overlapping transactions one after another instead of failing', async () => {
    const db = createDatabaseConnection(':memory:');
    await db.run('CREATE TABLE tx_probe (id INTEGER PRIMARY KEY, label TEXT)');
    const work = (label: string, delay: number) => db.transaction(async (tx) => {
      await tx.run('INSERT INTO tx_probe (label) VALUES (?)', [`${label}-start`]);
      await pause(delay);
      await tx.run('INSERT INTO tx_probe (label) VALUES (?)', [`${label}-end`]);
    });
    await Promise.all([work('a', 20), work('b', 5), work('c', 1)]);
    const rows = (await db.all<{ label: string }>('SELECT label FROM tx_probe ORDER BY id')).map((row) => row.label);
    // Each transaction's two inserts are adjacent: nothing from another transaction interleaves.
    expect(rows).toEqual(['a-start', 'a-end', 'b-start', 'b-end', 'c-start', 'c-end']);
  });

  it('rolls back a failed transaction and lets the next one run', async () => {
    const db = createDatabaseConnection(':memory:');
    await db.run('CREATE TABLE tx_probe (id INTEGER PRIMARY KEY, label TEXT)');
    await expect(db.transaction(async (tx) => {
      await tx.run('INSERT INTO tx_probe (label) VALUES (?)', ['lost']);
      throw new Error('boom');
    })).rejects.toThrow('boom');
    await db.transaction(async (tx) => { await tx.run('INSERT INTO tx_probe (label) VALUES (?)', ['kept']); });
    expect((await db.all('SELECT label FROM tx_probe')).map((row: any) => row.label)).toEqual(['kept']);
  });

  it('a transaction opened inside a transaction joins it through a savepoint', async () => {
    const db = createDatabaseConnection(':memory:');
    await db.run('CREATE TABLE tx_probe (id INTEGER PRIMARY KEY, label TEXT)');
    await db.transaction(async (tx) => {
      await tx.run('INSERT INTO tx_probe (label) VALUES (?)', ['outer']);
      await expect(tx.transaction(async (inner) => {
        await inner.run('INSERT INTO tx_probe (label) VALUES (?)', ['inner-lost']);
        throw new Error('inner failed');
      })).rejects.toThrow('inner failed');
      await tx.transaction(async (inner) => { await inner.run('INSERT INTO tx_probe (label) VALUES (?)', ['inner-kept']); });
    });
    expect((await db.all('SELECT label FROM tx_probe ORDER BY id')).map((row: any) => row.label)).toEqual(['outer', 'inner-kept']);
  });
});
